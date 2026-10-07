import { NextResponse } from 'next/server'
import { bearerToken, destroyAppSession } from '@/lib/auth/app-session'
import { isDashboardToken } from '@/lib/auth/dashboard-cookie'

export const runtime = 'nodejs'

/**
 * Abmelden in der App: macht den Token auf dem Server ungültig.
 *
 * Vorher löschte der Logout-Knopf den Token nur auf dem Gerät. Auf dem Server galt er bis
 * zu 30 Tage weiter — wer ihn einmal abgegriffen hatte, blieb angemeldet, egal wie oft der
 * Kellner auf „Logout" tippte.
 *
 * Immer 200, auch für einen unbekannten oder schon abgelaufenen Token: das Ziel „dieser
 * Token gilt nicht mehr" ist dann ebenfalls erreicht, und die App soll sich trotzdem
 * abmelden können. Dashboard-Tokens werden hier nicht angefasst — die haben ihren eigenen
 * Logout.
 */
export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (token && !isDashboardToken(token)) {
    await destroyAppSession(token)
  }
  return NextResponse.json({ ok: true })
}
