import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CardGrid } from './_components/card-grid'
import { getSession, isAdminSession } from '@/lib/auth/session'
import { LogoutButton } from '@/components/logout-button'
import { accessibleOrgIds, listCards, listCustomers } from '@/lib/cards/card-service'

export const dynamic = 'force-dynamic'

/**
 * Card overview — the dashboard entry point.
 *
 * Every signed-in operator sees every card and may hand any of them to any customer;
 * signing in at all requires the `DASHBOARD_ADMIN_EMAILS` allowlist. Customer logins are
 * never on it and do not reach this page — they use the app API, which scopes itself to
 * their own organisation.
 *
 * `?betrieb=<orgId>` narrows it to one business — the target when a business is clicked on
 * the Betriebe page. An id that matches no business is ignored rather than showing an
 * empty page that looks like "this business has no cards".
 */
export default async function KartenPage({
  searchParams,
}: {
  searchParams: Promise<{ betrieb?: string | string[] }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  // A temporary password has to be replaced before anything else is reachable.
  if (session.mustChangePassword) redirect('/dashboard/konto')

  const admin = await isAdminSession(session.userId)
  const orgIds = await accessibleOrgIds(session.userId)

  const [cards, customers] = await Promise.all([listCards({ orgIds }), listCustomers(orgIds)])

  const { betrieb: betriebParam } = await searchParams
  const betrieb =
    typeof betriebParam === 'string' ? (customers.find((c) => c.id === betriebParam) ?? null) : null
  const shown = betrieb ? cards.filter((card) => card.orgId === betrieb.id) : cards

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <span className="text-[14px] font-semibold text-ink">Stampie</span>
            <nav className="flex items-center gap-4 text-[13px]">
              <Link
                href="/dashboard/karten"
                className={betrieb ? 'text-ink-3 transition-colors hover:text-ink' : 'font-medium text-ink'}
              >
                Karten
              </Link>
              <Link
                href="/dashboard/kunden"
                className={betrieb ? 'font-medium text-ink' : 'text-ink-3 transition-colors hover:text-ink'}
              >
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
          cards={shown}
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
