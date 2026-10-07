'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth/session'
import { fail, guarded, ok, type ActionResult } from '@/lib/action-result'
import { prisma } from '@/lib/db'
import { accessibleOrgIds } from '@/lib/cards/card-service'
import { stampDay } from '@/lib/cards/stamping'

/**
 * „Heute das zweite Mal da": eine heute schon gestempelte Karte für genau einen weiteren
 * Stempel-Vorgang freigeben — oder die Freigabe zurücknehmen, solange sie nicht benutzt ist.
 *
 * Ein Stempel ist Geld, deshalb dieselben Prüfungen wie überall: angemeldet, kein offener
 * Passwortwechsel, und die Karte gehört zu einem Betrieb, den dieser Zugang sehen darf.
 */

const passIdSchema = z.string().cuid()

export async function unlockSecondStampAction(passId: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const pass = await loadAccessiblePass(passId)
    if ('error' in pass) return pass.error

    const last = await prisma.stampEvent.findFirst({
      where: { passId: pass.id, kind: 'STAMP' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const now = new Date()
    if (!last || stampDay(last.createdAt) !== stampDay(now)) {
      return fail('Diese Karte wurde heute noch nicht gestempelt und braucht keine Freigabe.', 'validation')
    }

    await prisma.issuedPass.update({ where: { id: pass.id }, data: { stampUnlockedAt: now } })
    revalidatePath(`/dashboard/kunden/${pass.orgId}/zweiter-besuch`)
    return ok(null)
  })
}

export async function revokeSecondStampAction(passId: string): Promise<ActionResult<null>> {
  return guarded(async () => {
    const pass = await loadAccessiblePass(passId)
    if ('error' in pass) return pass.error

    await prisma.issuedPass.update({ where: { id: pass.id }, data: { stampUnlockedAt: null } })
    revalidatePath(`/dashboard/kunden/${pass.orgId}/zweiter-besuch`)
    return ok(null)
  })
}

async function loadAccessiblePass(
  passId: string,
): Promise<{ id: string; orgId: string } | { error: ReturnType<typeof fail> }> {
  const parsed = passIdSchema.safeParse(passId)
  if (!parsed.success) return { error: fail('Ungültige Karte.', 'validation') }

  const session = await requireSession()
  if (session.mustChangePassword) {
    return { error: fail('Bitte zuerst das Passwort ändern.', 'forbidden') }
  }

  const pass = await prisma.issuedPass.findFirst({
    where: { id: parsed.data, isTest: false },
    select: { id: true, card: { select: { orgId: true } } },
  })
  const orgId = pass?.card.orgId ?? null
  const allowed = await accessibleOrgIds(session.userId)
  // Unbekannt und nicht erlaubt sehen gleich aus — eine geratene ID verrät nichts.
  if (!pass || !orgId || (allowed !== null && !allowed.includes(orgId))) {
    return { error: fail('Karte nicht gefunden.', 'not_found') }
  }
  return { id: pass.id, orgId }
}
