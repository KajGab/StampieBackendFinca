import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { bearerToken, requireAppUserAllowingPendingPassword } from '@/lib/auth/app-session'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/**
 * Set a new password (clears the forced-change flag after the first login).
 *
 * Two guards that were missing before:
 *
 *  - The current password is required. A token alone — an unlocked phone left on the
 *    counter, a token lifted from the device — must not be enough to take over the login
 *    and lock its owner out.
 *  - Every *other* session of this login is ended. Changing the password is what someone
 *    does when they suspect it leaked; leaving the other devices signed in would defeat
 *    the point. The device that made the change stays signed in.
 */
const bodySchema = z.object({
  currentPassword: z.string().min(1, 'Bitte das aktuelle Passwort eingeben.').max(200),
  newPassword: z.string().min(8, 'Das Passwort muss mindestens 8 Zeichen haben.').max(200),
})

export async function POST(request: Request): Promise<Response> {
  const appUser = await requireAppUserAllowingPendingPassword(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Ungültiges Passwort.' },
      { status: 400 },
    )
  }

  // Bremst das Durchprobieren des aktuellen Passworts mit einem gestohlenen Token.
  if (!rateLimit(`app-change-password:${appUser.userId}`, 5, 15 * 60 * 1000).allowed) {
    return NextResponse.json(
      { error: 'Zu viele Versuche. Bitte später erneut.' },
      { status: 429 },
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: appUser.userId },
    select: { passwordHash: true },
  })
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return NextResponse.json(
      { error: 'Das aktuelle Passwort stimmt nicht.', code: 'wrong_password' },
      { status: 403 },
    )
  }

  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json(
      { error: 'Das neue Passwort muss sich vom aktuellen unterscheiden.' },
      { status: 400 },
    )
  }

  const passwordHash = await hashPassword(parsed.data.newPassword)
  const currentToken = bearerToken(request)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: appUser.userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    // Alle anderen Geräte abmelden; das Gerät, das gerade ändert, bleibt angemeldet.
    prisma.appSession.deleteMany({
      where: { userId: appUser.userId, ...(currentToken ? { token: { not: currentToken } } : {}) },
    }),
  ])

  return NextResponse.json({ ok: true })
}
