import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppUser } from '@/lib/auth/app-session'
import { extractSerial } from '@/lib/cards/stamping'
import { checkMemberCard, describeMemberCheck, type MemberCheckFailure } from '@/lib/cards/member-check'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/**
 * Stammkundenkarte an der Kasse prüfen: gültig oder nicht, und den Besuch zählen.
 *
 * Gegenstück zu `/api/app/stamp` für Stammkundenkarten — dieselben Regeln für Anmeldung
 * und Betrieb. Die Antwort trägt eine fertige Zeile (`message`) für die Anzeige und die
 * Einzelheiten für eine eigene Darstellung.
 */

const bodySchema = z.object({ scanned: z.string().min(1).max(400) })

const STATUS: Record<MemberCheckFailure, number> = {
  not_found: 404,
  foreign: 403,
  not_member: 422,
  blocked: 409,
}
const CODE: Record<MemberCheckFailure, string> = {
  not_found: 'not_found',
  foreign: 'forbidden',
  not_member: 'not_member',
  blocked: 'member_blocked',
}

export async function POST(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
  if (appUser.role === 'AGENCY') {
    return NextResponse.json({ error: 'Agentur-Konten dürfen nicht prüfen.' }, { status: 403 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Kein Code übermittelt.', code: 'invalid' }, { status: 400 })
  }

  if (!rateLimit(`app-member:${appUser.orgId}`, 600, 60 * 60 * 1000).allowed) {
    return NextResponse.json(
      { error: 'Zu viele Prüfungen in kurzer Zeit. Bitte kurz warten.', code: 'rate_limited' },
      { status: 429 },
    )
  }

  const serial = extractSerial(parsed.data.scanned)
  if (!serial) {
    return NextResponse.json(
      { error: 'Dieser Code enthält keine gültige Kartennummer.', code: 'invalid' },
      { status: 422 },
    )
  }

  const result = await checkMemberCard({
    serial,
    scope: { orgId: appUser.orgId },
    userId: appUser.userId,
  })

  if (!result.valid) {
    return NextResponse.json(
      {
        error: describeMemberCheck(result),
        code: CODE[result.reason],
        ...(result.member
          ? { holderName: result.member.holderName, cardName: result.member.cardName }
          : {}),
      },
      { status: STATUS[result.reason] },
    )
  }

  return NextResponse.json({
    ok: true,
    valid: true,
    serial: result.member.serial,
    cardName: result.member.cardName,
    holderName: result.member.holderName,
    memberSince: result.member.memberSince.toISOString(),
    visits: result.visits,
    visitCounted: result.visitCounted,
    message: describeMemberCheck(result),
  })
}
