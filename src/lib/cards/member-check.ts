import 'server-only'
import { prisma } from '@/lib/db'
import { stampDay } from './stamping'

/**
 * Prüfen einer Stammkundenkarte an der Kasse — gemeinsam für die Betriebs-App und die
 * Kasse im Dashboard.
 *
 * Gültig ist eine Karte, wenn es sie gibt, sie zu diesem Betrieb (bzw. dieser Karte)
 * gehört, sie eine Stammkundenkarte ist und der Betrieb sie nicht gesperrt hat. Eine
 * gültige Prüfung zählt den Besuch — höchstens einmal pro Tag (deutsche Zeit), damit ein
 * Doppelscan oder ein zweites Vorzeigen am selben Abend die Statistik nicht aufbläht.
 */

export type MemberCheckFailure = 'not_found' | 'foreign' | 'not_member' | 'blocked'

export interface MemberInfo {
  serial: string
  holderName: string | null
  cardName: string
  memberSince: Date
  isTest: boolean
}

export type MemberCheckResult =
  | { valid: true; member: MemberInfo; visits: number; visitCounted: boolean }
  | { valid: false; reason: MemberCheckFailure; message: string; member: MemberInfo | null }

export interface MemberPassRow {
  id: string
  serial: string
  kind: 'STAMP' | 'COUPON' | 'MEMBER'
  blockedAt: Date | null
  holderName: string | null
  createdAt: Date
  isTest: boolean
  cardId: string
  card: { name: string; orgId: string | null }
}

/** Wofür geprüft wird: alle Karten eines Betriebs (App) oder genau eine Karte (Dashboard-Kasse). */
export interface MemberCheckScope {
  orgId?: string | null
  cardId?: string
}

/** Warum eine gescannte Karte hier nicht als Stammkundenkarte gilt — oder null, wenn sie gilt. */
export function memberCardProblem(
  pass: MemberPassRow | null,
  scope: MemberCheckScope,
): { reason: MemberCheckFailure; message: string } | null {
  if (!pass) return { reason: 'not_found', message: 'Diese Karte gibt es nicht.' }
  if (scope.orgId !== undefined && pass.card.orgId !== scope.orgId) {
    return { reason: 'foreign', message: 'Diese Karte gehört nicht zu deinem Betrieb.' }
  }
  if (scope.cardId !== undefined && pass.cardId !== scope.cardId) {
    return { reason: 'foreign', message: 'Diese Karte gehört nicht zu dieser Stammkundenkarte.' }
  }
  if (pass.kind !== 'MEMBER') return { reason: 'not_member', message: 'Das ist keine Stammkundenkarte.' }
  if (pass.blockedAt) return { reason: 'blocked', message: 'Diese Stammkundenkarte ist gesperrt.' }
  return null
}

/** Ein Besuch zählt, wenn heute (deutsche Zeit) noch keiner gezählt wurde. */
export function shouldCountVisit(lastVisitAt: Date | null, now: Date): boolean {
  return !lastVisitAt || stampDay(lastVisitAt) !== stampDay(now)
}

function infoOf(pass: MemberPassRow): MemberInfo {
  return {
    serial: pass.serial,
    holderName: pass.holderName,
    cardName: pass.card.name,
    memberSince: pass.createdAt,
    isTest: pass.isTest,
  }
}

export async function checkMemberCard(input: {
  serial: string
  scope: MemberCheckScope
  /** Wer geprüft hat — steht wie beim Stempeln in der Prüfspur. */
  userId: string
  now?: Date
}): Promise<MemberCheckResult> {
  const now = input.now ?? new Date()
  const pass = await prisma.issuedPass.findFirst({
    where: { serial: input.serial },
    select: {
      id: true,
      serial: true,
      kind: true,
      blockedAt: true,
      holderName: true,
      createdAt: true,
      isTest: true,
      cardId: true,
      card: { select: { name: true, orgId: true } },
    },
  })

  const problem = memberCardProblem(pass, input.scope)
  if (problem || !pass) {
    // Fremde Karten verraten nichts über ihren Inhaber; eine gesperrte eigene schon —
    // das Personal soll sehen, wessen Karte es ist.
    const showInfo = pass && problem?.reason === 'blocked'
    return {
      valid: false,
      reason: problem?.reason ?? 'not_found',
      message: problem?.message ?? 'Diese Karte gibt es nicht.',
      member: showInfo ? infoOf(pass) : null,
    }
  }

  const lastVisit = await prisma.stampEvent.findFirst({
    where: { passId: pass.id, kind: 'VISIT' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const visitCounted = shouldCountVisit(lastVisit?.createdAt ?? null, now)
  if (visitCounted) {
    await prisma.stampEvent.create({
      data: {
        passId: pass.id,
        cardId: pass.cardId,
        kind: 'VISIT',
        delta: 0,
        balance: 0,
        stampedBy: input.userId,
        createdAt: now,
      },
    })
  }
  const visits = await prisma.stampEvent.count({ where: { passId: pass.id, kind: 'VISIT' } })

  return { valid: true, member: infoOf(pass), visits, visitCounted }
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

/** Eine Zeile für die Kasse — dieselbe in App und Dashboard. */
export function describeMemberCheck(result: MemberCheckResult): string {
  if (!result.valid) {
    return result.member?.holderName ? `${result.message} (${result.member.holderName})` : result.message
  }
  const who = result.member.holderName ?? 'Ohne Namen'
  const since = dateFormat.format(result.member.memberSince)
  const visit = result.visitCounted ? 'Besuch gezählt.' : 'Besuch heute schon gezählt.'
  return `Stammkunde ✓ ${who}, Mitglied seit ${since}. ${visit}`
}

export interface MemberRow {
  passId: string
  serial: string
  holderName: string | null
  memberSince: Date
  blockedAt: Date | null
  visits: number
  lastVisitAt: Date | null
}

/** Alle echten Stammkundenkarten einer Karte, neueste zuerst — für die Liste im Dashboard. */
export async function listMembers(cardId: string): Promise<MemberRow[]> {
  const passes = await prisma.issuedPass.findMany({
    where: { cardId, kind: 'MEMBER', isTest: false },
    select: { id: true, serial: true, holderName: true, createdAt: true, blockedAt: true },
    orderBy: { createdAt: 'desc' },
  })
  if (passes.length === 0) return []

  const visits = await prisma.stampEvent.groupBy({
    by: ['passId'],
    where: { passId: { in: passes.map((p) => p.id) }, kind: 'VISIT' },
    _count: { _all: true },
    _max: { createdAt: true },
  })
  const byPass = new Map(visits.map((v) => [v.passId, v]))

  return passes.map((p) => ({
    passId: p.id,
    serial: p.serial,
    holderName: p.holderName,
    memberSince: p.createdAt,
    blockedAt: p.blockedAt,
    visits: byPass.get(p.id)?._count._all ?? 0,
    lastVisitAt: byPass.get(p.id)?._max.createdAt ?? null,
  }))
}
