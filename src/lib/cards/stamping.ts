/**
 * Stamping rules, kept free of IO so they can be tested exhaustively.
 *
 * The rules exist because the counter is money: a stamp is a fraction of a free coffee.
 * Every one of these guards corresponds to a way the counter could otherwise be inflated,
 * by accident or on purpose.
 */

/**
 * Eine Karte bekommt höchstens einen Stempel-Vorgang pro Kalendertag. Wer heute schon
 * gestempelt wurde, kann erst ab morgen 00:00 Uhr wieder gestempelt werden — ein Besuch, ein
 * Stempel. Das fängt nebenbei auch jeden Doppelscan ab.
 *
 * Gezählt wird nach deutscher Zeit: die Betriebe sind hier, und auf dem Server (UTC) läge
 * Mitternacht sonst um 1 oder 2 Uhr nachts.
 */
export const STAMP_TIME_ZONE = 'Europe/Berlin'

/** Doppelscan-Sperre beim Einlösen einer vollen Karte: zweimal ausgelöst ist nicht zwei Belohnungen. */
export const STAMP_COOLDOWN_MS = 60_000

/** Obergrenze einer einzelnen Buchung. Mehr als das ist an der Kasse ein Vertipper. */
export const MAX_STAMPS_PER_BOOKING = 10

export type StampDecision =
  | { ok: true; nextBalance: number; booked: number; completesCard: boolean }
  | { ok: false; reason: 'already_today' }
  | { ok: false; reason: 'already_full' }

export interface StampState {
  stamps: number
  stampGoal: number
  /** Zeitpunkt des letzten Stempel-Vorgangs auf dieser Karte (nicht des letzten Einlösens). */
  lastStampAt: Date | null
  /**
   * Wie viele Stempel diese eine Buchung vergeben soll — drei Kaffee auf einmal sind ein
   * Vorgang, nicht drei Scans. Ohne Angabe einer.
   *
   * Wird auf das gedeckelt, was bis zum Ziel noch passt: `booked` sagt danach, was
   * tatsächlich gebucht wurde, damit die Kasse nicht mehr verspricht als auf der Karte
   * landet.
   */
  requested?: number
}

export function decideStamp(state: StampState, now: Date = new Date()): StampDecision {
  // Zuerst „voll": eine volle Karte wird eingelöst, und das geht auch am selben Tag — das
  // Einlösen ist kein Stempel.
  if (state.stamps >= state.stampGoal) return { ok: false, reason: 'already_full' }

  if (state.lastStampAt && stampDay(state.lastStampAt) === stampDay(now)) {
    return { ok: false, reason: 'already_today' }
  }

  const wanted = Math.min(Math.max(Math.trunc(state.requested ?? 1), 1), MAX_STAMPS_PER_BOOKING)
  const nextBalance = Math.min(state.stamps + wanted, state.stampGoal)
  return {
    ok: true,
    nextBalance,
    booked: nextBalance - state.stamps,
    completesCard: nextBalance >= state.stampGoal,
  }
}

export type RedeemDecision = { ok: true; nextBalance: number } | { ok: false; reason: 'not_full' }

export function decideRedeem(state: Pick<StampState, 'stamps' | 'stampGoal'>): RedeemDecision {
  if (state.stamps < state.stampGoal) return { ok: false, reason: 'not_full' }
  // A full card is cashed in as a whole; leftover stamps carry over.
  return { ok: true, nextBalance: state.stamps - state.stampGoal }
}

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: STAMP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Der Kalendertag in deutscher Zeit, z. B. „2026-10-07“ — Sommer- und Winterzeit inklusive. */
export function stampDay(at: Date): string {
  return dayFormat.format(at)
}

/** Die Meldung an der Kasse, gleich für App und Dashboard. */
export const ALREADY_STAMPED_TODAY_MESSAGE =
  'Diese Karte wurde heute schon gestempelt. Ab morgen, 00:00 Uhr, geht es wieder.'

/**
 * Serial numbers travel in a QR code, so a scan can pick up whitespace or a full URL.
 * Accepts a bare serial or any URL ending in `/s/<serial>`.
 */
export function extractSerial(scanned: string): string | null {
  const trimmed = scanned.trim()
  if (trimmed.length === 0) return null

  const fromUrl = /\/s\/([A-Za-z0-9._-]{4,64})\/?$/.exec(trimmed)
  if (fromUrl?.[1]) return fromUrl[1].toUpperCase()

  if (/^[A-Za-z0-9._-]{4,64}$/.test(trimmed)) return trimmed.toUpperCase()

  return null
}

export function formatCooldown(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} Minuten` : `${seconds} Sekunden`
}
