import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CardGrid } from '../../karten/_components/card-grid'
import { getSession, isAdminSession } from '@/lib/auth/session'
import { LogoutButton } from '@/components/logout-button'
import { accessibleOrgIds, listCards, listCustomers } from '@/lib/cards/card-service'

export const dynamic = 'force-dynamic'

/**
 * Ein Betrieb mit seinen Stempel- und Gutscheinkarten — Ziel des Klicks auf der
 * Betriebe-Seite. Eine Gesamtübersicht aller Karten gibt es nicht mehr: jede Karte gehört
 * zu einem Betrieb und steht hier.
 *
 * Jeder angemeldete Betreiber sieht jeden Betrieb (Zugang regelt `DASHBOARD_ADMIN_EMAILS`).
 * Eine unbekannte ID führt zurück zur Liste, statt eine leere Seite zu zeigen, die wie
 * „dieser Betrieb hat keine Karten“ aussähe.
 */
export default async function BetriebPage({ params }: { params: Promise<{ orgId: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')
  // A temporary password has to be replaced before anything else is reachable.
  if (session.mustChangePassword) redirect('/dashboard/konto')

  const { orgId } = await params
  const admin = await isAdminSession(session.userId)
  const orgIds = await accessibleOrgIds(session.userId)

  const [cards, customers] = await Promise.all([listCards({ orgIds }), listCustomers(orgIds)])
  const betrieb = customers.find((c) => c.id === orgId)
  if (!betrieb) redirect('/dashboard/kunden')

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

      <main className="mx-auto max-w-6xl px-6 py-6">
        <CardGrid
          cards={cards.filter((card) => card.orgId === betrieb.id)}
          customers={customers}
          betrieb={betrieb}
          canAssign={admin}
          // Single-operator setup: this login both manages customers and runs the till, so
          // it may stamp any assigned card. (The button only shows for assigned cards.)
          canStamp
        />
      </main>
    </div>
  )
}
