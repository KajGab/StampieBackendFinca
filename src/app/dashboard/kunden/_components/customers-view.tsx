'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, KeyRound, Mail, MapPin, Pencil, Phone, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { CustomerDialog } from './customer-dialog'
import { LoginsDialog } from './logins-dialog'
import type { CustomerRecord } from '@/lib/customers/customer-service'

type DialogState = { mode: 'create' } | { mode: 'edit'; customer: CustomerRecord } | null

/**
 * Customer list with instant name search. Filtering happens on the client — the whole set
 * is already loaded, so typing filters without a round-trip.
 */
export function CustomersView({
  customers,
  canManage,
}: {
  customers: CustomerRecord[]
  canManage: boolean
}) {
  const [query, setQuery] = React.useState('')
  const [dialog, setDialog] = React.useState<DialogState>(null)
  const [loginsFor, setLoginsFor] = React.useState<CustomerRecord | null>(null)
  const router = useRouter()

  const term = query.trim().toLowerCase()
  const filtered = term
    ? customers.filter((c) => c.name.toLowerCase().includes(term))
    : customers

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[17px] font-semibold text-ink">Betriebe</h1>
        {canManage ? (
          <Button variant="primary" onClick={() => setDialog({ mode: 'create' })}>
            <Plus />
            Neuer Betrieb
          </Button>
        ) : null}
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nach Name suchen…"
          className="pl-9"
          aria-label="Betriebe nach Name suchen"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-ink">
            {customers.length === 0 ? 'Noch kein Betrieb' : 'Kein Treffer'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-snug text-ink-3">
            {customers.length === 0
              ? 'Lege deinen ersten Betrieb an — danach kannst du ihm beim Erstellen einer Karte zuweisen.'
              : `Kein Betrieb passt auf „${query.trim()}".`}
          </p>
          {canManage && customers.length === 0 ? (
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => setDialog({ mode: 'create' })}
            >
              <Plus />
              Ersten Betrieb anlegen
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Firma</th>
                <th className="px-4 py-2.5 font-medium">Kontakt</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Adresse</th>
                <th className="px-4 py-2.5 text-right font-medium">Karten</th>
                {canManage ? <th className="w-10 px-4 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                // Die ganze Zeile führt zu den Karten des Betriebs; der Name ist zusätzlich ein
                // echter Link, damit es auch mit der Tastatur und per Mittelklick geht.
                <tr
                  key={c.id}
                  onClick={() => router.push(cardsHref(c.id))}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={cardsHref(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      title="Karten dieses Betriebs ansehen"
                      className="flex items-center gap-2 font-medium text-ink hover:underline"
                    >
                      <Building2 className="size-3.5 shrink-0 text-ink-3" />
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    <div className="flex flex-col gap-0.5">
                      {c.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3 shrink-0 text-ink-3" />
                          {c.phone}
                        </span>
                      ) : null}
                      {c.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail className="size-3 shrink-0 text-ink-3" />
                          {c.email}
                        </span>
                      ) : null}
                      {!c.phone && !c.email ? <span className="text-ink-3">—</span> : null}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-ink-2 md:table-cell">
                    {c.street || c.postalCode || c.city ? (
                      <span className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 size-3 shrink-0 text-ink-3" />
                        <span>
                          {c.street ? (
                            <>
                              {c.street}
                              <br />
                            </>
                          ) : null}
                          {[c.postalCode, c.city].filter(Boolean).join(' ')}
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.cardCount > 0 ? (
                      <Link
                        href={cardsHref(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex"
                        title="Karten dieses Betriebs ansehen"
                      >
                        <Badge tone="neutral">{c.cardCount}</Badge>
                      </Link>
                    ) : (
                      <span className="text-ink-3">0</span>
                    )}
                  </td>
                  {canManage ? (
                    // Die Knöpfe öffnen Dialoge — ein Klick darauf soll nicht auch die Zeile auslösen.
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${c.name}: App-Zugänge`}
                          title="App-Zugänge (Login)"
                          onClick={() => setLoginsFor(c)}
                        >
                          <KeyRound />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${c.name} bearbeiten`}
                          title="Bearbeiten"
                          onClick={() => setDialog({ mode: 'edit', customer: c })}
                        >
                          <Pencil />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerDialog state={dialog} onOpenChange={(open) => !open && setDialog(null)} />
      <LoginsDialog customer={loginsFor} onOpenChange={(open) => !open && setLoginsFor(null)} />
    </div>
  )
}

/** Die Kartenübersicht, eingeschränkt auf einen Betrieb. */
function cardsHref(orgId: string): string {
  return `/dashboard/karten?betrieb=${encodeURIComponent(orgId)}`
}
