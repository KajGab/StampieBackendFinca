import 'server-only'
import { prisma } from '@/lib/db'
import type { CardKind } from '@/lib/cards/schema'

/**
 * Statistiken eines Betriebs — für die Betriebs-App (`/api/app/stats`) und die
 * Statistik-Seite im Dashboard. Eine Rechnung, damit beide dieselben Zahlen zeigen.
 *
 * Ein „Kunde" = ein echtes Handy (`IssuedPass.deviceKey`) mit einer Stempelkarte. Pässe
 * ohne Gerät zählen nicht, Testkarten nicht. Mehrfach stempeln oder eine volle Karte + neue
 * Karte machen keinen neuen Kunden: der Zähler läuft auf demselben Pass weiter, und über
 * `deviceKey` wird zusätzlich entdoppelt.
 *
 * Gutscheinkarten zählen getrennt: ausgegeben, eingelöst, offen.
 *
 * Alles aus vorhandenen Daten — der Stempel-/Ausgabe-Code bleibt unangetastet.
 */

export interface DistBucket {
  stamps: number
  count: number
}

export interface CardStat {
  id: string
  kind: CardKind
  name: string
  stampGoal: number
  customers: number
  full: number
  redeemed: number
  distribution: DistBucket[]
}

export interface CouponStat {
  id: string
  name: string
  issued: number
  redeemed: number
  open: number
}

export interface WeekStat {
  label: string
  customers: number
  new: number
}

export interface OrgStats {
  customers: number
  newThisMonth: number
  active: number
  inactive: number
  inactiveAfterMonths: number
  weekly: WeekStat[]
  /** Alle Karten des Betriebs, wie bisher für die App — Gutscheinkarten mit 0 Kunden. */
  cards: CardStat[]
  /** Nur die Gutscheinkarten. */
  coupons: CouponStat[]
}

export interface StatsCardInput {
  id: string
  name: string
  kind: CardKind
  /** Aktuelles Stempel-Ziel: veröffentlicht, sonst Entwurf, sonst 10. */
  stampGoal: number
}

export interface StatsPassInput {
  id: string
  cardId: string
  kind: CardKind
  deviceKey: string | null
  stamps: number
  rewardCount: number
  redeemedAt: Date | null
  createdAt: Date
}

export const WEEKS = 12

/**
 * Die Rechnung selbst, ohne Datenbank. `passes` enthält nur echte Pässe (keine Testkarten);
 * `lastVisitByPass` den jüngsten Stempel je Pass.
 */
export function computeOrgStats(input: {
  cards: StatsCardInput[]
  passes: StatsPassInput[]
  lastVisitByPass: Map<string, Date>
  inactiveAfterMonths: number
  now: Date
}): OrgStats {
  const { cards, lastVisitByPass, inactiveAfterMonths, now } = input
  // Kunden zählen nur über Stempelkarten-Pässe mit Gerät.
  const stampPasses = input.passes.filter((p) => p.kind === 'STAMP' && p.deviceKey !== null)

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - inactiveAfterMonths)

  // Pro Gerät (= Person): erster Kontakt + letzter Besuch über alle seine Pässe.
  const devices = new Map<string, { first: Date; last: Date }>()
  for (const p of stampPasses) {
    const dk = p.deviceKey as string
    const visit = lastVisitByPass.get(p.id) ?? p.createdAt
    const d = devices.get(dk)
    if (!d) {
      devices.set(dk, { first: p.createdAt, last: visit })
    } else {
      if (p.createdAt < d.first) d.first = p.createdAt
      if (visit > d.last) d.last = visit
    }
  }

  let active = 0
  let inactive = 0
  let newThisMonth = 0
  for (const d of devices.values()) {
    if (d.last < cutoff) inactive++
    else active++
    if (d.first >= startOfMonth) newThisMonth++
  }

  // Wochen-Zeitreihe (letzte 12 Wochen): kumulierte Kunden + neue je Woche.
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)) // Montag dieser Woche
  const weekly: WeekStat[] = []
  for (let i = WEEKS - 1; i >= 0; i--) {
    const ws = new Date(weekStart)
    ws.setDate(ws.getDate() - i * 7)
    const we = new Date(ws)
    we.setDate(we.getDate() + 7)
    let nw = 0
    let cum = 0
    for (const dev of devices.values()) {
      if (dev.first < we) cum++
      if (dev.first >= ws && dev.first < we) nw++
    }
    const label = `${String(ws.getDate()).padStart(2, '0')}.${String(ws.getMonth() + 1).padStart(2, '0')}.`
    weekly.push({ label, customers: cum, new: nw })
  }

  // Pro Karte: Kunden, „voll", eingelöst, Stempel-Verteilung (nach Gerät entdoppelt).
  const cardStats: CardStat[] = []
  for (const card of cards) {
    // Eine Zahl für alle Karten dieses Programms — dieselbe, gegen die beide Kassen
    // rechnen und die im Wallet steht.
    const goal = card.stampGoal
    const cardPasses = stampPasses.filter((p) => p.cardId === card.id)

    // Aktueller Pass je Gerät auf dieser Karte = der neueste.
    const currentByDevice = new Map<string, { stamps: number; createdAt: Date }>()
    let redeemed = 0
    for (const p of cardPasses) {
      redeemed += p.rewardCount
      const dk = p.deviceKey as string
      const cur = currentByDevice.get(dk)
      if (!cur || p.createdAt > cur.createdAt) {
        currentByDevice.set(dk, { stamps: p.stamps, createdAt: p.createdAt })
      }
    }

    let full = 0
    const counts = new Map<number, number>() // Stempelzahl -> Anzahl Kunden
    for (const cur of currentByDevice.values()) {
      if (cur.stamps >= goal) full++
      const s = Math.min(cur.stamps, goal)
      if (s >= 1) counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    const distribution: DistBucket[] = []
    for (let s = 1; s <= goal; s++) distribution.push({ stamps: s, count: counts.get(s) ?? 0 })

    cardStats.push({
      id: card.id,
      kind: card.kind,
      name: card.name,
      stampGoal: goal,
      customers: currentByDevice.size,
      full,
      redeemed,
      distribution,
    })
  }

  // Gutscheinkarten: jeder ausgegebene Gutschein ist entweder eingelöst oder noch offen.
  const coupons: CouponStat[] = cards
    .filter((card) => card.kind === 'COUPON')
    .map((card) => {
      const issued = input.passes.filter((p) => p.cardId === card.id && p.kind === 'COUPON')
      const redeemed = issued.filter((p) => p.redeemedAt !== null).length
      return { id: card.id, name: card.name, issued: issued.length, redeemed, open: issued.length - redeemed }
    })

  return {
    customers: devices.size,
    newThisMonth,
    active,
    inactive,
    inactiveAfterMonths,
    weekly,
    cards: cardStats,
    coupons,
  }
}

/** Lädt alles Nötige für einen Betrieb aus der Datenbank und rechnet. */
export async function loadOrgStats(orgId: string, now: Date = new Date()): Promise<OrgStats> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { inaktivNachMonaten: true },
  })
  const inactiveAfterMonths = org?.inaktivNachMonaten ?? 2

  const rows = await prisma.card.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      kind: true,
      designs: { select: { status: true, stampGoal: true } },
    },
  })
  const cards: StatsCardInput[] = rows.map((c) => {
    const published = c.designs.find((d) => d.status === 'PUBLISHED')
    const source = published ?? c.designs.find((d) => d.status === 'DRAFT') ?? null
    return { id: c.id, name: c.name, kind: c.kind, stampGoal: source?.stampGoal ?? 10 }
  })

  const passes: StatsPassInput[] = cards.length
    ? await prisma.issuedPass.findMany({
        where: {
          cardId: { in: cards.map((c) => c.id) },
          isTest: false,
          // Stempelkarten nur mit Gerät (echtes Handy hat die Karte); Gutscheine alle.
          OR: [{ kind: 'STAMP', deviceKey: { not: null } }, { kind: 'COUPON' }],
        },
        select: {
          id: true,
          cardId: true,
          kind: true,
          deviceKey: true,
          stamps: true,
          rewardCount: true,
          redeemedAt: true,
          createdAt: true,
        },
      })
    : []

  // Letzter echter Besuch je Pass = jüngstes STAMP-Event; fehlt eins, gilt die Ausgabe.
  const stampPassIds = passes.filter((p) => p.kind === 'STAMP').map((p) => p.id)
  const lastEvents = stampPassIds.length
    ? await prisma.stampEvent.groupBy({
        by: ['passId'],
        where: { passId: { in: stampPassIds }, kind: 'STAMP' },
        _max: { createdAt: true },
      })
    : []
  const lastVisitByPass = new Map<string, Date>()
  for (const e of lastEvents) if (e._max.createdAt) lastVisitByPass.set(e.passId, e._max.createdAt)

  return computeOrgStats({ cards, passes, lastVisitByPass, inactiveAfterMonths, now })
}
