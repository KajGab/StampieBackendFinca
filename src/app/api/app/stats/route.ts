import { NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/auth/app-session'
import { loadOrgStats } from '@/lib/stats/org-stats'

export const runtime = 'nodejs'

/**
 * Statistiken für den eingeloggten Betrieb. Die Rechnung steht in `lib/stats/org-stats`,
 * die auch die Statistik-Seite im Dashboard benutzt — hier nur Anmeldung und Antwortform.
 */
export async function GET(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  const stats = await loadOrgStats(appUser.orgId)

  // Antwortform wie bisher: Karten ohne id/kind, keine Gutschein-Liste.
  return NextResponse.json({
    customers: stats.customers,
    newThisMonth: stats.newThisMonth,
    active: stats.active,
    inactive: stats.inactive,
    inactiveAfterMonths: stats.inactiveAfterMonths,
    weekly: stats.weekly,
    cards: stats.cards.map(({ id: _id, kind: _kind, ...card }) => card),
  })
}
