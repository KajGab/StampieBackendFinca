import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { accessibleOrgIds, listCustomers } from '@/lib/cards/card-service'
import { loadOrgStats } from '@/lib/stats/org-stats'
import { exportFileBase, statsSheets, toCsv, toXlsx } from '@/lib/stats/stats-export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Download der Statistiken eines Betriebs: `?format=xlsx` (Standard) oder `?format=csv`.
 * Dieselben Zugangsregeln wie die Statistik-Seite — angemeldet, kein offener
 * Passwortwechsel, und der Betrieb muss für diesen Zugang sichtbar sein.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
  if (session.mustChangePassword) {
    return NextResponse.json({ error: 'Bitte zuerst das Passwort ändern.' }, { status: 403 })
  }

  const { orgId } = await params
  const customers = await listCustomers(await accessibleOrgIds(session.userId))
  const betrieb = customers.find((c) => c.id === orgId)
  // 404 statt 403: eine geratene ID soll nicht verraten, dass es den Betrieb gibt.
  if (!betrieb) return NextResponse.json({ error: 'Betrieb nicht gefunden.' }, { status: 404 })

  const now = new Date()
  const sheets = statsSheets(await loadOrgStats(betrieb.id, now), betrieb.name, now)
  const base = exportFileBase(betrieb.name, now)
  const csv = request.nextUrl.searchParams.get('format') === 'csv'

  const body = csv ? Buffer.from(toCsv(sheets), 'utf8') : toXlsx(sheets)
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': csv
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${base}.${csv ? 'csv' : 'xlsx'}"`,
      'Content-Length': String(body.length),
      'Cache-Control': 'no-store',
    },
  })
}
