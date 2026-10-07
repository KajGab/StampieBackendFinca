import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { summarizeTodaysVisits, type VisitEventInput } from '@/lib/cards/second-visit'

/** Mittwoch, 7. Oktober 2026, 15:00 Uhr in Berlin (Sommerzeit, UTC+2). */
const now = new Date('2026-10-07T13:00:00Z')

const event = (
  passId: string,
  createdAt: string,
  unlockedAt: string | null = null,
): VisitEventInput => ({
  passId,
  createdAt: new Date(createdAt),
  pass: {
    serial: `K-${passId.toUpperCase()}`,
    stamps: 4,
    stampGoal: 10,
    stampUnlockedAt: unlockedAt ? new Date(unlockedAt) : null,
  },
  card: { name: 'Kaffeekarte' },
})

describe('summarizeTodaysVisits', () => {
  it('zeigt nur Karten, die heute nach deutscher Zeit gestempelt wurden', () => {
    const rows = summarizeTodaysVisits(
      [
        event('a', '2026-10-07T08:00:00Z'), // heute 10:00
        event('b', '2026-10-06T21:59:00Z'), // gestern 23:59
        event('c', '2026-10-06T22:00:00Z'), // heute 00:00
      ],
      now,
    )
    expect(rows.map((r) => r.serial)).toEqual(['K-A', 'K-C'])
  })

  it('fasst mehrere Stempel einer Karte zu einer Zeile zusammen, neueste zuerst', () => {
    const rows = summarizeTodaysVisits(
      [event('a', '2026-10-07T06:00:00Z'), event('b', '2026-10-07T07:00:00Z'), event('a', '2026-10-07T09:00:00Z')],
      now,
    )
    expect(rows.map((r) => [r.serial, r.visitsToday])).toEqual([
      ['K-A', 2],
      ['K-B', 1],
    ])
    expect(rows[0]?.lastStampAt).toEqual(new Date('2026-10-07T09:00:00Z'))
  })

  it('gilt nur als freigegeben, solange die Freigabe nach dem letzten Stempel liegt', () => {
    const rows = summarizeTodaysVisits(
      [
        event('frei', '2026-10-07T06:00:00Z', '2026-10-07T10:00:00Z'),
        event('benutzt', '2026-10-07T11:00:00Z', '2026-10-07T10:00:00Z'),
      ],
      now,
    )
    expect(Object.fromEntries(rows.map((r) => [r.serial, r.unlocked]))).toEqual({
      'K-FREI': true,
      'K-BENUTZT': false,
    })
  })
})
