'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertStampAccess, requireSession } from '@/lib/auth/session'
import { fail, fromZodError, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { accessibleOrgIds } from '@/lib/cards/card-service'
import { checkMemberCard, describeMemberCheck } from '@/lib/cards/member-check'
import { extractSerial } from '@/lib/cards/stamping'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Stammkundenkarten im Dashboard: an der Kasse prüfen, einzelne Karten sperren.
 */

const checkInputSchema = z.object({
  cardId: z.string().cuid(),
  scanned: z.string().min(1).max(300),
})

/** Was die Kasse anzeigt — Datumswerte als Text, damit es über die Leitung passt. */
export interface MemberCheckView {
  valid: boolean
  message: string
  serial: string | null
  holderName: string | null
  memberSince: string | null
  visits: number | null
  visitCounted: boolean
  isTest: boolean
}

export async function checkMemberAction(input: unknown): Promise<ActionResult<MemberCheckView>> {
  return guarded(async () => {
    const parsed = checkInputSchema.safeParse(input)
    if (!parsed.success) return fromZodError(parsed.error)

    // Dieselbe Berechtigung wie die Kasse: wer stempeln darf, darf auch prüfen.
    const { session, cardId } = await assertStampAccess(parsed.data.cardId)
    if (!rateLimit(`member-check:${cardId}`, 600, 60 * 60 * 1000).allowed) {
      return fail('Zu viele Prüfungen in kurzer Zeit. Bitte kurz warten.', 'rate_limited')
    }

    const serial = extractSerial(parsed.data.scanned)
    if (!serial) return fail('Dieser Code enthält keine gültige Kartennummer.', 'validation')

    const result = await checkMemberCard({ serial, scope: { cardId }, userId: session.userId })
    // Auch „ungültig" ist ein Ergebnis, kein Fehler: die Kasse zeigt es rot an.
    return ok({
      valid: result.valid,
      message: describeMemberCheck(result),
      serial: result.member?.serial ?? null,
      holderName: result.member?.holderName ?? null,
      memberSince: result.member?.memberSince.toISOString() ?? null,
      visits: result.valid ? result.visits : null,
      visitCounted: result.valid ? result.visitCounted : false,
      isTest: result.member?.isTest ?? false,
    })
  })
}

export async function setMemberBlockedAction(
  passId: string,
  blocked: boolean,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = z.string().cuid().safeParse(passId)
    if (!parsed.success) return fail('Ungültige Karte.', 'validation')

    const session = await requireSession()
    if (session.mustChangePassword) return fail('Bitte zuerst das Passwort ändern.', 'forbidden')

    const pass = await prisma.issuedPass.findFirst({
      where: { id: parsed.data, kind: 'MEMBER' },
      select: { id: true, cardId: true, card: { select: { orgId: true } } },
    })
    const allowed = await accessibleOrgIds(session.userId)
    const orgId = pass?.card.orgId ?? null
    // Unbekannt und nicht erlaubt sehen gleich aus — eine geratene ID verrät nichts.
    if (!pass || !orgId || (allowed !== null && !allowed.includes(orgId))) {
      return fail('Karte nicht gefunden.', 'not_found')
    }

    await prisma.issuedPass.update({
      where: { id: pass.id },
      data: { blockedAt: blocked ? new Date() : null },
    })
    revalidatePath(`/dashboard/karten/${pass.cardId}/stammkunden`)
    return ok(null)
  })
}
