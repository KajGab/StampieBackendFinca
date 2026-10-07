import 'server-only'
import { prisma } from '@/lib/db'
import { stampDay } from './stamping'

/**
 * „Heute das zweite Mal da": die Karten eines Betriebs, die heute (00:00–23:59 Uhr deutscher
 * Zeit) schon gestempelt wurden — und damit für den Rest des Tages gesperrt sind, bis jemand
 * sie für einen weiteren Stempel freigibt (`IssuedPass.stampUnlockedAt`).
 */

export interface TodaysVisit {
  passId: string
  serial: string
  cardName: string
  stamps: number
  stampGoal: number
  /** Wie viele Stempel-Vorgänge heute schon auf dieser Karte gebucht wurden. */
  visitsToday: number
  lastStampAt: Date
  /** Freigegeben und noch nicht benutzt: der nächste Scan darf stempeln. */
  unlocked: boolean
}

export interface VisitEventInput {
  passId: string
  createdAt: Date
  pass: {
    serial: string
    stamps: number
    stampGoal: number
    stampUnlockedAt: Date | null
  }
  card: { name: string }
}

/** Gruppiert Stempel-Ereignisse zu einer Zeile je Karte — nur die von heute, neueste zuerst. */
export function summarizeTodaysVisits(events: VisitEventInput[], now: Date): TodaysVisit[] {
  const today = stampDay(now)
  const byPass = new Map<string, TodaysVisit>()

  for (const event of events) {
    if (stampDay(event.createdAt) !== today) continue
    const row = byPass.get(event.passId)
    if (row) {
      row.visitsToday++
      if (event.createdAt > row.lastStampAt) row.lastStampAt = event.createdAt
      continue
    }
    byPass.set(event.passId, {
      passId: event.passId,
      serial: event.pass.serial,
      cardName: event.card.name,
      stamps: event.pass.stamps,
      stampGoal: event.pass.stampGoal,
      visitsToday: 1,
      lastStampAt: event.createdAt,
      unlocked: false,
    })
  }

  const rows = [...byPass.values()]
  for (const row of rows) {
    const unlockedAt = events.find((e) => e.passId === row.passId)?.pass.stampUnlockedAt ?? null
    row.unlocked = unlockedAt !== null && unlockedAt > row.lastStampAt
  }
  return rows.sort((a, b) => b.lastStampAt.getTime() - a.lastStampAt.getTime())
}

export async function listTodaysVisits(orgId: string, now: Date = new Date()): Promise<TodaysVisit[]> {
  // 26 Stunden zurück decken „heute" in deutscher Zeit sicher ab, auch am Tag der
  // Zeitumstellung; was davon gestern war, sortiert `summarizeTodaysVisits` aus.
  const since = new Date(now.getTime() - 26 * 60 * 60 * 1000)
  const events = await prisma.stampEvent.findMany({
    where: {
      kind: 'STAMP',
      createdAt: { gte: since },
      card: { orgId },
      pass: { isTest: false },
    },
    select: {
      passId: true,
      createdAt: true,
      pass: { select: { serial: true, stamps: true, stampGoal: true, stampUnlockedAt: true } },
      card: { select: { name: true } },
    },
  })
  return summarizeTodaysVisits(events, now)
}
