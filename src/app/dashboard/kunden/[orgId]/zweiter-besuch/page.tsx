import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSession, isAdminSession } from '@/lib/auth/session'
import { LogoutButton } from '@/components/logout-button'
import { accessibleOrgIds, listCustomers } from '@/lib/cards/card-service'
import { listTodaysVisits } from '@/lib/cards/second-visit'
import { STAMP_TIME_ZONE } from '@/lib/cards/stamping'
import { VisitList, type VisitRow } from './_components/visit-list'

export const dynamic = 'force-dynamic'

const timeFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: STAMP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})
const dateFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: STAMP_TIME_ZONE,
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/**
 * „Heute das zweite Mal da": die Karten des Betriebs, die heute schon gestempelt wurden.
 * Kommt ein Kunde am selben Tag wieder, wird seine Karte hier für einen weiteren Stempel
 * freigegeben — sonst greift die Tagessperre bis 00:00 Uhr.
 */
export default async function ZweiterBesuchPage({ params }: { params: Promise<{ orgId: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.mustChangePassword) redirect('/dashboard/konto')

  const { orgId } = await params
  const admin = await isAdminSession(session.userId)
  const customers = await listCustomers(await accessibleOrgIds(session.userId))
  const betrieb = customers.find((c) => c.id === orgId)
  if (!betrieb) redirect('/dashboard/kunden')

  const now = new Date()
  const rows: VisitRow[] = (await listTodaysVisits(betrieb.id, now)).map((v) => ({
    passId: v.passId,
    serial: v.serial,
    cardName: v.cardName,
    stamps: v.stamps,
    stampGoal: v.stampGoal,
    visitsToday: v.visitsToday,
    lastStampTime: timeFormat.format(v.lastStampAt),
    unlocked: v.unlocked,
  }))

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <span className="text-[14px] font-semibold text-ink">Stampie</span>
            <nav className="flex items-center gap-4 text-[13px]">
              <Link href="/dashboard/kunden" className="font-medium text-ink">
                Betriebe
              </Link>
              <Link href="/dashboard/auskunft" className="text-ink-3 transition-colors hover:text-ink">
                Auskunft
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/konto"
              className="text-[12px] text-ink-3 transition-colors hover:text-ink"
            >
              {admin ? 'Agentur-Zugang' : (customers[0]?.name ?? session.email)}
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        <div>
          <Link
            href={`/dashboard/kunden/${encodeURIComponent(betrieb.id)}`}
            className="inline-flex items-center gap-1 text-[12px] text-ink-3 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3" />
            {betrieb.name}
          </Link>
          <h1 className="text-[17px] font-semibold text-ink">Heute das zweite Mal da</h1>
          <p className="max-w-prose text-[13px] leading-snug text-ink-3">
            Karten, die heute ({dateFormat.format(now)}, 00:00–23:59 Uhr) schon gestempelt wurden.
            Jede Karte bekommt nur einen Stempel pro Tag. Kommt ein Kunde heute ein zweites Mal,
            gib seine Karte hier frei — dann lässt sie sich einmal mehr stempeln.
          </p>
        </div>

        <VisitList rows={rows} />
      </main>
    </div>
  )
}
