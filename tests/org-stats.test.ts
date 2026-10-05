import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { computeOrgStats, WEEKS, type StatsPassInput } from '@/lib/stats/org-stats'

/** Donnerstag, 15. Oktober 2026 — die Woche beginnt am Montag, dem 12. */
const now = new Date(2026, 9, 15, 12)
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10)

const stampCard = { id: 'card-stamp', name: 'Kaffeekarte', kind: 'STAMP' as const, stampGoal: 5 }
const couponCard = { id: 'card-coupon', name: 'Geburtstag', kind: 'COUPON' as const, stampGoal: 10 }

let n = 0
function pass(overrides: Partial<StatsPassInput>): StatsPassInput {
  n++
  return {
    id: `pass-${n}`,
    cardId: stampCard.id,
    kind: 'STAMP',
    deviceKey: `device-${n}`,
    stamps: 0,
    rewardCount: 0,
    redeemedAt: null,
    createdAt: day(2026, 10, 1),
    ...overrides,
  }
}

function run(passes: StatsPassInput[], lastVisitByPass = new Map<string, Date>()) {
  return computeOrgStats({
    cards: [stampCard, couponCard],
    passes,
    lastVisitByPass,
    inactiveAfterMonths: 2,
    now,
  })
}

describe('computeOrgStats', () => {
  it('zählt ein Handy als einen Kunden, auch mit zwei Pässen, und nimmt den neuesten Stand', () => {
    const stats = run([
      pass({ deviceKey: 'handy-a', stamps: 5, createdAt: day(2026, 8, 1) }),
      pass({ deviceKey: 'handy-a', stamps: 2, createdAt: day(2026, 10, 2) }),
    ])
    expect(stats.customers).toBe(1)
    const card = stats.cards.find((c) => c.id === stampCard.id)
    expect(card?.customers).toBe(1)
    expect(card?.full).toBe(0)
    expect(card?.distribution.find((d) => d.stamps === 2)?.count).toBe(1)
  })

  it('lässt Stempelkarten ohne Gerät und Gutscheine bei den Kunden außen vor', () => {
    const stats = run([
      pass({ deviceKey: null }),
      pass({ cardId: couponCard.id, kind: 'COUPON' }),
    ])
    expect(stats.customers).toBe(0)
  })

  it('teilt in aktiv und inaktiv nach dem letzten Besuch und zählt Neue dieses Monats', () => {
    const regular = pass({ createdAt: day(2026, 5, 1) })
    const gone = pass({ createdAt: day(2026, 5, 1) })
    const fresh = pass({ createdAt: day(2026, 10, 3) })
    const stats = run(
      [regular, gone, fresh],
      new Map([
        [regular.id, day(2026, 10, 10)],
        [gone.id, day(2026, 6, 1)],
      ]),
    )
    expect(stats.active).toBe(2)
    expect(stats.inactive).toBe(1)
    expect(stats.newThisMonth).toBe(1)
  })

  it('zählt volle Karten, eingelöste Belohnungen und deckelt die Verteilung beim Ziel', () => {
    const stats = run([
      pass({ stamps: 7, rewardCount: 2 }),
      pass({ stamps: 5 }),
      pass({ stamps: 1, rewardCount: 1 }),
      pass({ stamps: 0 }),
    ])
    const card = stats.cards.find((c) => c.id === stampCard.id)
    expect(card?.customers).toBe(4)
    expect(card?.full).toBe(2)
    expect(card?.redeemed).toBe(3)
    expect(card?.distribution).toEqual([
      { stamps: 1, count: 1 },
      { stamps: 2, count: 0 },
      { stamps: 3, count: 0 },
      { stamps: 4, count: 0 },
      { stamps: 5, count: 2 },
    ])
  })

  it('zählt Gutscheine nur für Gutscheinkarten: ausgegeben, eingelöst, offen', () => {
    const stats = run([
      pass({ cardId: couponCard.id, kind: 'COUPON', redeemedAt: day(2026, 10, 5) }),
      pass({ cardId: couponCard.id, kind: 'COUPON' }),
      pass({ cardId: couponCard.id, kind: 'COUPON', deviceKey: null }),
      // Belohnungs-Gutschein einer vollen Stempelkarte: kein Teil der Gutscheinkarte.
      pass({ cardId: stampCard.id, kind: 'COUPON' }),
    ])
    expect(stats.coupons).toEqual([
      { id: couponCard.id, name: 'Geburtstag', issued: 3, redeemed: 1, open: 2 },
    ])
  })

  it('liefert zwölf Wochen, die letzte ist die laufende', () => {
    const stats = run([pass({ createdAt: day(2026, 10, 13) }), pass({ createdAt: day(2026, 9, 1) })])
    expect(stats.weekly).toHaveLength(WEEKS)
    expect(stats.weekly.at(-1)).toEqual({ label: '12.10.', customers: 2, new: 1 })
  })
})
