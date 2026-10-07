'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LockOpen, Search, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Spinner } from '@/components/ui/misc'
import { revokeSecondStampAction, unlockSecondStampAction } from '@/actions/second-visit'

export interface VisitRow {
  passId: string
  serial: string
  cardName: string
  stamps: number
  stampGoal: number
  visitsToday: number
  /** Uhrzeit des letzten Stempels heute, schon in deutscher Zeit formatiert. */
  lastStampTime: string
  unlocked: boolean
}

/**
 * Die Liste mit Suche nach der Kartennummer — die steht im Wallet unter dem Strichcode,
 * so findet man die Karte des Kunden, der gerade vor einem steht.
 */
export function VisitList({ rows }: { rows: VisitRow[] }) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const term = query.trim().toUpperCase()
  const filtered = term ? rows.filter((r) => r.serial.toUpperCase().includes(term)) : rows

  const run = async (row: VisitRow, action: (passId: string) => Promise<{ success: boolean; error: { message: string } | null }>) => {
    setBusyId(row.passId)
    setError(null)
    try {
      const result = await action(row.passId)
      if (!result.success) {
        setError(result.error?.message ?? 'Das hat nicht geklappt. Bitte erneut versuchen.')
        return
      }
      router.refresh()
    } catch {
      setError('Das hat nicht geklappt. Bitte erneut versuchen.')
    } finally {
      setBusyId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-ink">Heute noch keine Karte gestempelt</p>
        <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-snug text-ink-3">
          Sobald eine Karte dieses Betriebs heute gestempelt wird, steht sie hier.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kartennummer suchen, z. B. K-3F9A…"
          className="pl-9"
          aria-label="Nach Kartennummer suchen"
        />
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">Keine Karte mit „{query.trim()}" heute gestempelt.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Kartennummer</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Karte</th>
                <th className="px-4 py-2.5 font-medium">Stempel</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Heute gestempelt</th>
                <th className="px-4 py-2.5 text-right font-medium">Zweiter Stempel</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const busy = busyId === row.passId
                return (
                  <tr key={row.passId} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-mono text-[12.5px] text-ink">{row.serial}</td>
                    <td className="hidden px-4 py-3 text-ink-2 sm:table-cell">{row.cardName}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-2">
                      {row.stamps}/{row.stampGoal}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-ink-2 sm:table-cell">
                      {row.visitsToday > 1 ? `${row.visitsToday}×, zuletzt ` : ''}
                      {row.lastStampTime} Uhr
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {row.unlocked ? (
                          <>
                            <Badge tone="ok">Freigegeben</Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => run(row, revokeSecondStampAction)}
                              title="Freigabe zurücknehmen"
                            >
                              {busy ? <Spinner /> : <Undo2 />}
                              Zurücknehmen
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy}
                            onClick={() => run(row, unlockSecondStampAction)}
                          >
                            {busy ? <Spinner /> : <LockOpen />}
                            Freigeben
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
