import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import {
  describeMemberCheck,
  memberCardProblem,
  shouldCountVisit,
  type MemberPassRow,
} from '@/lib/cards/member-check'
import { parseHolderName } from '@/lib/privacy/consent'
import { computeOrgStats } from '@/lib/stats/org-stats'

/**
 * Die Stammkundenkarte an der Kasse: gilt sie, gehört sie zu diesem Betrieb, und wird der
 * Besuch gezählt? Ein Fehler hier heißt entweder ein Stammkundenvorteil für Fremde oder
 * ein abgewiesener Stammkunde — beides merkt der Betrieb sofort.
 */

const pass = (over: Partial<MemberPassRow> = {}): MemberPassRow => ({
  id: 'p1',
  serial: 'K-ABC123',
  kind: 'MEMBER',
  blockedAt: null,
  holderName: 'Erika Musterfrau',
  createdAt: new Date('2026-09-01T10:00:00Z'),
  isTest: false,
  cardId: 'card-1',
  card: { name: 'Stammgäste', orgId: 'org-1' },
  ...over,
})

describe('memberCardProblem', () => {
  it('lässt eine eigene, nicht gesperrte Stammkundenkarte gelten', () => {
    expect(memberCardProblem(pass(), { orgId: 'org-1' })).toBeNull()
    expect(memberCardProblem(pass(), { cardId: 'card-1' })).toBeNull()
  })

  it('weist ab: unbekannt, fremder Betrieb, andere Karte, keine Stammkundenkarte, gesperrt', () => {
    expect(memberCardProblem(null, { orgId: 'org-1' })?.reason).toBe('not_found')
    expect(memberCardProblem(pass(), { orgId: 'org-2' })?.reason).toBe('foreign')
    expect(memberCardProblem(pass(), { cardId: 'card-2' })?.reason).toBe('foreign')
    expect(memberCardProblem(pass({ kind: 'STAMP' }), { orgId: 'org-1' })?.reason).toBe('not_member')
    expect(memberCardProblem(pass({ blockedAt: new Date() }), { orgId: 'org-1' })?.reason).toBe('blocked')
  })

  it('prüft den Betrieb vor der Kartenart — eine fremde Karte verrät nicht, was sie ist', () => {
    expect(memberCardProblem(pass({ kind: 'STAMP' }), { orgId: 'org-2' })?.reason).toBe('foreign')
  })
})

describe('shouldCountVisit', () => {
  it('zählt den ersten Besuch und einen am nächsten Tag, nicht aber einen zweiten am selben Tag', () => {
    const now = new Date('2026-10-09T15:00:00Z')
    expect(shouldCountVisit(null, now)).toBe(true)
    expect(shouldCountVisit(new Date('2026-10-09T06:00:00Z'), now)).toBe(false)
    expect(shouldCountVisit(new Date('2026-10-08T15:00:00Z'), now)).toBe(true)
  })

  it('rechnet nach deutscher Zeit: 23:30 und 00:30 Uhr sind zwei Tage', () => {
    // 23:30 Uhr am 8. und 00:30 Uhr am 9. in Berlin (Sommerzeit, UTC+2).
    expect(shouldCountVisit(new Date('2026-10-08T21:30:00Z'), new Date('2026-10-08T22:30:00Z'))).toBe(true)
  })
})

describe('describeMemberCheck', () => {
  const member = {
    serial: 'K-ABC123',
    holderName: 'Erika Musterfrau',
    cardName: 'Stammgäste',
    memberSince: new Date('2026-09-01T10:00:00Z'),
    isTest: false,
  }

  it('nennt bei einer gültigen Karte Name, Mitgliedsdatum und ob der Besuch gezählt wurde', () => {
    expect(describeMemberCheck({ valid: true, member, visits: 3, visitCounted: true })).toBe(
      'Stammkunde ✓ Erika Musterfrau, Mitglied seit 01.09.2026. Besuch gezählt.',
    )
    expect(describeMemberCheck({ valid: true, member, visits: 3, visitCounted: false })).toContain(
      'Besuch heute schon gezählt.',
    )
  })

  it('nennt bei einer gesperrten Karte den Inhaber', () => {
    expect(
      describeMemberCheck({ valid: false, reason: 'blocked', message: 'Diese Stammkundenkarte ist gesperrt.', member }),
    ).toBe('Diese Stammkundenkarte ist gesperrt. (Erika Musterfrau)')
  })
})

describe('parseHolderName', () => {
  it('nimmt einen normalen Namen, zieht Leerraum zusammen', () => {
    expect(parseHolderName('  Erika   Musterfrau ')).toBe('Erika Musterfrau')
    expect(parseHolderName('Zoë Ünal-Groß')).toBe('Zoë Ünal-Groß')
  })

  it('verwirft zu kurz, zu lang, leer und fehlend', () => {
    expect(parseHolderName('E')).toBeNull()
    expect(parseHolderName('x'.repeat(61))).toBeNull()
    expect(parseHolderName('   ')).toBeNull()
    expect(parseHolderName(null)).toBeNull()
  })

  it('macht Steuerzeichen zu Leerraum, statt sie auf die Karte zu schreiben', () => {
    expect(parseHolderName('Erika\nMusterfrau\u0000')).toBe('Erika Musterfrau')
  })
})

describe('Statistik der Stammkundenkarten', () => {
  const now = new Date(2026, 9, 15, 12)
  const stats = computeOrgStats({
    cards: [{ id: 'm1', name: 'Stammgäste', kind: 'MEMBER', stampGoal: 10 }],
    passes: [
      { id: 'a', cardId: 'm1', kind: 'MEMBER', deviceKey: 'd1', stamps: 0, rewardCount: 0, redeemedAt: null, createdAt: new Date(2026, 8, 1), blockedAt: null },
      { id: 'b', cardId: 'm1', kind: 'MEMBER', deviceKey: 'd2', stamps: 0, rewardCount: 0, redeemedAt: null, createdAt: new Date(2026, 9, 3), blockedAt: new Date(2026, 9, 10) },
      { id: 'c', cardId: 'm1', kind: 'MEMBER', deviceKey: 'd3', stamps: 0, rewardCount: 0, redeemedAt: null, createdAt: new Date(2026, 9, 5), blockedAt: null },
    ],
    lastVisitByPass: new Map(),
    inactiveAfterMonths: 2,
    now,
    memberVisits: [
      { passId: 'a', cardId: 'm1', createdAt: new Date(2026, 9, 2) },
      { passId: 'a', cardId: 'm1', createdAt: new Date(2026, 9, 9) },
      { passId: 'c', cardId: 'm1', createdAt: new Date(2026, 9, 6) },
      { passId: 'c', cardId: 'm1', createdAt: new Date(2026, 8, 20) }, // letzter Monat
    ],
  })

  it('zählt Stammkunden, neue, gesperrte und die Besuche dieses Monats', () => {
    expect(stats.members).toEqual([
      { id: 'm1', name: 'Stammgäste', members: 3, newThisMonth: 2, blocked: 1, visitsThisMonth: 3, activeThisMonth: 2 },
    ])
  })

  it('zählt Stammkunden nicht als Stempelkarten-Kunden', () => {
    expect(stats.customers).toBe(0)
  })
})
