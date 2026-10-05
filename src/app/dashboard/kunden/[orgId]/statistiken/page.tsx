import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSession, isAdminSession } from '@/lib/auth/session'
import { LogoutButton } from '@/components/logout-button'
import { accessibleOrgIds, listCustomers } from '@/lib/cards/card-service'
import { loadOrgStats } from '@/lib/stats/org-stats'

export const dynamic = 'force-dynamic'

/**
 * Statistiken der Karten, die ein Betrieb im Umlauf hat — erreichbar über den Knopf
 * „Statistiken" auf der Seite des Betriebs. Dieselbe Rechnung wie in der Betriebs-App
 * (`lib/stats/org-stats`), damit Dashboard und App nie verschiedene Zahlen zeigen.
 */
export default async function StatistikPage({ params }: { params: Promise<{ orgId: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.mustChangePassword) redirect('/dashboard/konto')

  const { orgId } = await params
  const admin = await isAdminSession(session.userId)
  const customers = await listCustomers(await accessibleOrgIds(session.userId))
  const betrieb = customers.find((c) => c.id === orgId)
  if (!betrieb) redirect('/dashboard/kunden')

  const stats = await loadOrgStats(betrieb.id)
  const stampCards = stats.cards.filter((c) => c.kind === 'STAMP')
  const months = stats.inactiveAfterMonths

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

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-6">
        <div>
          <Link
            href={`/dashboard/kunden/${encodeURIComponent(betrieb.id)}`}
            className="inline-flex items-center gap-1 text-[12px] text-ink-3 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3" />
            {betrieb.name}
          </Link>
          <h1 className="text-[17px] font-semibold text-ink">Statistiken</h1>
          <p className="text-[13px] text-ink-3">
            Karten von {betrieb.name}, die bei Kunden im Umlauf sind. Testkarten zählen nicht mit.
          </p>
        </div>

        <section className="space-y-3">
          <SectionTitle
            title="Kunden mit Stempelkarte"
            hint="Ein Handy zählt als ein Kunde, auch mit mehreren Karten."
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Kunden" value={stats.customers} />
            <StatTile label="Neu in diesem Monat" value={stats.newThisMonth} />
            <StatTile
              label="Aktiv"
              value={stats.active}
              hint={`Besuch in den letzten ${months} ${months === 1 ? 'Monat' : 'Monaten'}`}
            />
            <StatTile
              label="Inaktiv"
              value={stats.inactive}
              hint={`Länger als ${months} ${months === 1 ? 'Monat' : 'Monate'} nicht da`}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Neue Kunden pro Woche" hint="Die letzten 12 Wochen, jeweils ab Montag." />
          <Panel>
            <ColumnChart
              caption="Neue Kunden pro Woche"
              columnHeader="Woche ab"
              valueHeader="Neue Kunden"
              data={stats.weekly.map((w) => ({
                key: w.label,
                label: w.label,
                value: w.new,
                title: `Woche ab ${w.label}: ${w.new} ${w.new === 1 ? 'neuer Kunde' : 'neue Kunden'}`,
              }))}
              thinLabels
            />
          </Panel>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Stempelkarten" />
          {stampCards.length === 0 ? (
            <Empty>Keine Stempelkarte.</Empty>
          ) : (
            stampCards.map((card) => (
              <Panel key={card.id}>
                <h3 className="text-[14px] font-semibold text-ink">{card.name}</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <StatTile label="Kunden" value={card.customers} compact />
                  <StatTile label="Karte voll" value={card.full} hint="bereit zum Einlösen" compact />
                  <StatTile label="Belohnungen eingelöst" value={card.redeemed} compact />
                </div>
                <p className="mt-5 text-[12.5px] font-medium text-ink-2">
                  Kunden nach Stempelstand (Ziel: {card.stampGoal})
                </p>
                <ColumnChart
                  caption={`${card.name}: Kunden nach Stempelstand`}
                  columnHeader="Stempel"
                  valueHeader="Kunden"
                  data={card.distribution.map((d) => ({
                    key: String(d.stamps),
                    label: String(d.stamps),
                    value: d.count,
                    title: `${d.stamps} Stempel: ${d.count} ${d.count === 1 ? 'Kunde' : 'Kunden'}`,
                  }))}
                />
              </Panel>
            ))
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle title="Gutscheinkarten" />
          {stats.coupons.length === 0 ? (
            <Empty>Keine Gutscheinkarte.</Empty>
          ) : (
            stats.coupons.map((coupon) => (
              <Panel key={coupon.id}>
                <h3 className="text-[14px] font-semibold text-ink">{coupon.name}</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <StatTile label="Ausgegeben" value={coupon.issued} compact />
                  <StatTile
                    label="Eingelöst"
                    value={coupon.redeemed}
                    hint={coupon.issued > 0 ? `${Math.round((coupon.redeemed / coupon.issued) * 100)} % der ausgegebenen` : undefined}
                    compact
                  />
                  <StatTile label="Offen" value={coupon.open} hint="noch nicht eingelöst" compact />
                </div>
              </Panel>
            ))
          )}
        </section>
      </main>
    </div>
  )
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface p-4">{children}</div>
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-ink-3">{children}</p>
}

function StatTile({
  label,
  value,
  hint,
  compact = false,
}: {
  label: string
  value: number
  hint?: string
  compact?: boolean
}) {
  return (
    <div className={compact ? 'rounded-lg bg-surface-2 px-3 py-2.5' : 'rounded-xl border border-line bg-surface px-4 py-3'}>
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className={compact ? 'text-[18px] font-semibold text-ink' : 'text-[24px] font-semibold text-ink'}>
        {value.toLocaleString('de-DE')}
      </p>
      {hint ? <p className="text-[11.5px] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  )
}

/** Kleinste „glatte" Zahl (1, 2, 5 · 10^n) ≥ value — für die obere Achsenmarke. */
function niceMax(value: number): number {
  if (value <= 1) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude
  }
  return 10 * magnitude
}

/**
 * Säulendiagramm für eine Datenreihe, ohne Bibliothek: Säulen höchstens 24 px breit, oben
 * 4 px gerundet, unten gerade auf der Grundlinie. Der Wert jeder Säule steht im Tooltip
 * (die ganze Spaltenhöhe ist Trefferfläche) und in der Tabelle darunter.
 */
function ColumnChart({
  data,
  caption,
  columnHeader,
  valueHeader,
  thinLabels = false,
}: {
  data: { key: string; label: string; value: number; title: string }[]
  caption: string
  columnHeader: string
  valueHeader: string
  /** Auf schmalen Bildschirmen nur jede zweite Achsenbeschriftung zeigen. */
  thinLabels?: boolean
}) {
  const max = Math.max(0, ...data.map((d) => d.value))
  if (max === 0) {
    return <p className="mt-2 text-[12.5px] text-ink-3">Noch keine Daten.</p>
  }
  const top = niceMax(max)

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {/* y-Achse: nur 0 und die glatte Obergrenze — die genauen Werte tragen Tooltip und Tabelle. */}
        <div className="flex h-36 flex-col justify-between text-right text-[10.5px] tabular-nums text-ink-3">
          <span className="-translate-y-1/2">{top.toLocaleString('de-DE')}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative h-36 flex-1 border-b border-t border-line" role="img" aria-label={caption}>
          <div className="absolute inset-0 flex items-end">
            {data.map((d) => (
              <div
                key={d.key}
                title={d.title}
                className="group flex h-full flex-1 items-end justify-center px-px"
              >
                <div
                  className="w-full max-w-6 rounded-t bg-accent transition-opacity group-hover:opacity-80"
                  style={{ height: `${(d.value / top) * 100}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        {/* Platzhalter in Breite der y-Achse, damit die Beschriftungen unter den Säulen stehen. */}
        <div className="invisible text-[10.5px] tabular-nums" aria-hidden>
          {top.toLocaleString('de-DE')}
        </div>
        <div className="flex flex-1">
          {data.map((d, i) => (
            // Feste Spaltenbreite, die Beschriftung darüber zentriert — eine breitere
            // Beschriftung darf in die (dann ausgeblendete) Nachbarspalte ragen, aber die
            // Spalten nicht verschieben.
            <span key={d.key} className="relative h-5 min-w-0 flex-1">
              <span
                className={`absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap text-[10.5px] tabular-nums text-ink-3 ${
                  thinLabels && i % 2 === 1 ? 'invisible sm:visible' : ''
                }`}
              >
                {d.label}
              </span>
            </span>
          ))}
        </div>
      </div>
      <details className="mt-2 text-[12px] text-ink-3">
        <summary className="cursor-pointer select-none hover:text-ink">Als Tabelle anzeigen</summary>
        <table className="mt-2 text-left text-[12px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-ink-3">
              <th className="pr-6 font-medium">{columnHeader}</th>
              <th className="font-medium">{valueHeader}</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {data.map((d) => (
              <tr key={d.key}>
                <td className="pr-6 tabular-nums">{d.label}</td>
                <td className="tabular-nums">{d.value.toLocaleString('de-DE')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
