import { describe, expect, it } from 'vitest'
import {
  MAX_STAMPS_PER_BOOKING,
  decideRedeem,
  decideStamp,
  extractSerial,
  formatCooldown,
} from '@/lib/cards/stamping'

const now = new Date('2026-08-04T12:00:00Z')

describe('decideStamp', () => {
  it('books the first stamp on a fresh card', () => {
    const d = decideStamp({ stamps: 0, stampGoal: 10, lastStampAt: null }, now)
    expect(d).toEqual({ ok: true, nextBalance: 1, booked: 1, completesCard: false })
  })

  it('flags the stamp that completes the card', () => {
    const d = decideStamp({ stamps: 9, stampGoal: 10, lastStampAt: null }, now)
    expect(d.ok && d.completesCard).toBe(true)
  })

  it('refuses to overfill', () => {
    const d = decideStamp({ stamps: 10, stampGoal: 10, lastStampAt: null }, now)
    expect(d).toEqual({ ok: false, reason: 'already_full' })
  })

  describe('mehrere Stempel in einer Buchung', () => {
    it('books the requested number at once', () => {
      const d = decideStamp({ stamps: 2, stampGoal: 10, lastStampAt: null, requested: 3 }, now)
      expect(d).toEqual({ ok: true, nextBalance: 5, booked: 3, completesCard: false })
    })

    it('stops at the goal and reports what actually landed', () => {
      // Die Kasse darf nicht mehr versprechen, als auf der Karte ankommt.
      const d = decideStamp({ stamps: 8, stampGoal: 10, lastStampAt: null, requested: 5 }, now)
      expect(d).toEqual({ ok: true, nextBalance: 10, booked: 2, completesCard: true })
    })

    it('caps a fat-fingered number at the per-booking limit', () => {
      const d = decideStamp({ stamps: 0, stampGoal: 999, lastStampAt: null, requested: 400 }, now)
      expect(d.ok && d.booked).toBe(MAX_STAMPS_PER_BOOKING)
    })

    it.each([0, -3, 0.5])('treats %s as a single stamp', (requested) => {
      const d = decideStamp({ stamps: 0, stampGoal: 10, lastStampAt: null, requested }, now)
      expect(d.ok && d.booked).toBe(1)
    })

    it('still refuses a full card, however many were asked for', () => {
      const d = decideStamp({ stamps: 10, stampGoal: 10, lastStampAt: null, requested: 3 }, now)
      expect(d).toEqual({ ok: false, reason: 'already_full' })
    })

    it('still allows only one booking per day', () => {
      const d = decideStamp(
        { stamps: 1, stampGoal: 10, lastStampAt: new Date(now.getTime() - 5_000), requested: 3 },
        now,
      )
      expect(!d.ok && d.reason).toBe('already_today')
    })
  })

  describe('ein Stempel-Vorgang pro Tag — erst ab 00:00 Uhr deutscher Zeit wieder', () => {
    const at = (iso: string) => new Date(iso)
    const stamp = (last: string, current: string) =>
      decideStamp({ stamps: 3, stampGoal: 10, lastStampAt: at(last) }, at(current))

    it('sperrt einen zweiten Stempel am selben Tag, auch Stunden später', () => {
      // 08:00 und 23:59 Uhr in Berlin (Sommerzeit, UTC+2).
      expect(stamp('2026-08-04T06:00:00Z', '2026-08-04T06:00:05Z')).toEqual({ ok: false, reason: 'already_today' })
      expect(stamp('2026-08-04T06:00:00Z', '2026-08-04T21:59:00Z')).toEqual({ ok: false, reason: 'already_today' })
    })

    it('gibt die Karte um 00:00 Uhr deutscher Zeit wieder frei', () => {
      // 23:30 Uhr am 4. und 00:00 Uhr am 5. in Berlin — nur eine halbe Stunde, aber ein neuer Tag.
      expect(stamp('2026-08-04T21:30:00Z', '2026-08-04T22:00:00Z').ok).toBe(true)
    })

    it('rechnet nach deutscher Zeit, nicht nach UTC', () => {
      // Beides der 5. August in Berlin (00:30 und 12:00), in UTC aber zwei Tage.
      expect(stamp('2026-08-04T22:30:00Z', '2026-08-05T10:00:00Z')).toEqual({ ok: false, reason: 'already_today' })
    })

    it('stimmt auch am Tag der Zeitumstellung', () => {
      // 25. Oktober 2026: 00:30 Uhr (Sommerzeit) und 23:30 Uhr (Winterzeit) — 24 Stunden
      // dazwischen, aber derselbe Tag.
      expect(stamp('2026-10-24T22:30:00Z', '2026-10-25T22:30:00Z')).toEqual({ ok: false, reason: 'already_today' })
      // 00:00 Uhr am 26. in Winterzeit ist 23:00 UTC.
      expect(stamp('2026-10-25T22:30:00Z', '2026-10-25T23:00:00Z').ok).toBe(true)
    })

    describe('Freigabe für einen zweiten Stempel („Heute das zweite Mal da")', () => {
      const unlockedStamp = (last: string, unlocked: string | null, current: string) =>
        decideStamp(
          { stamps: 3, stampGoal: 10, lastStampAt: at(last), unlockedAt: unlocked ? at(unlocked) : null },
          at(current),
        )

      it('lässt nach der Freigabe einen weiteren Stempel am selben Tag zu', () => {
        // 10:00 gestempelt, 14:00 freigegeben, 14:01 wieder gestempelt (Berlin, Sommerzeit).
        expect(unlockedStamp('2026-08-04T08:00:00Z', '2026-08-04T12:00:00Z', '2026-08-04T12:01:00Z').ok).toBe(true)
      })

      it('gilt nur für einen Vorgang: nach dem zweiten Stempel ist die Karte wieder gesperrt', () => {
        // Freigabe 14:00, zweiter Stempel 14:01 — jetzt 15:00.
        expect(unlockedStamp('2026-08-04T12:01:00Z', '2026-08-04T12:00:00Z', '2026-08-04T13:00:00Z')).toEqual({
          ok: false,
          reason: 'already_today',
        })
      })

      it('zählt keine Freigabe, die vor dem letzten Stempel erteilt wurde', () => {
        expect(unlockedStamp('2026-08-04T08:00:00Z', '2026-08-04T07:00:00Z', '2026-08-04T09:00:00Z')).toEqual({
          ok: false,
          reason: 'already_today',
        })
      })
    })

    it('lässt eine volle Karte am selben Tag trotzdem einlösen', () => {
      const d = decideStamp({ stamps: 10, stampGoal: 10, lastStampAt: now }, now)
      expect(d).toEqual({ ok: false, reason: 'already_full' })
    })
  })
})

describe('decideRedeem', () => {
  it('refuses an incomplete card', () => {
    expect(decideRedeem({ stamps: 7, stampGoal: 10 })).toEqual({ ok: false, reason: 'not_full' })
  })

  it('empties a full card', () => {
    expect(decideRedeem({ stamps: 10, stampGoal: 10 })).toEqual({ ok: true, nextBalance: 0 })
  })

  it('carries surplus stamps over instead of discarding them', () => {
    // Can happen if the goal was lowered after the card was issued.
    expect(decideRedeem({ stamps: 12, stampGoal: 10 })).toEqual({ ok: true, nextBalance: 2 })
  })
})

describe('extractSerial', () => {
  it('reads a serial out of the scanned barcode URL', () => {
    expect(extractSerial('https://stampie-xi.vercel.app/s/TEST-RH0EJNHI')).toBe('TEST-RH0EJNHI')
  })

  it('tolerates a trailing slash and whitespace', () => {
    expect(extractSerial('  https://x.de/s/ABC123/  ')).toBe('ABC123')
  })

  it('accepts a bare serial typed by hand and upper-cases it', () => {
    expect(extractSerial('test-rh0ejnhi')).toBe('TEST-RH0EJNHI')
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['https://evil.example/', 'no serial'],
    ['ab', 'too short'],
    ['drop table issued_pass', 'spaces'],
    ['<script>alert(1)</script>', 'markup'],
  ])('rejects %s (%s)', (input) => {
    expect(extractSerial(input)).toBeNull()
  })
})

describe('formatCooldown', () => {
  it('reads in seconds below a minute', () => {
    expect(formatCooldown(15_000)).toBe('15 Sekunden')
  })

  it('rounds up to minutes above that', () => {
    expect(formatCooldown(90_000)).toBe('2 Minuten')
  })
})
