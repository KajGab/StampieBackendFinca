'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Search, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Spinner } from '@/components/ui/misc'
import { setMemberBlockedAction } from '@/actions/members'

export interface MemberListRow {
  passId: string
  serial: string
  holderName: string | null
  memberSince: string
  blocked: boolean
  visits: number
  lastVisit: string | null
}

/** Liste mit Suche nach Name oder Kartennummer; Sperren und Entsperren je Zeile. */
export function MemberList({ rows }: { rows: MemberListRow[] }) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const term = query.trim().toLowerCase()
  const filtered = term
    ? rows.filter(
        (r) => r.serial.toLowerCase().includes(term) || (r.holderName ?? '').toLowerCase().includes(term),
      )
    : rows

  const toggle = async (row: MemberListRow) => {
    setBusyId(row.passId)
    setError(null)
    try {
      const result = await setMemberBlockedAction(row.passId, !row.blocked)
      if (!result.success) {
        setError(result.error.message)
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
        <p className="text-[14px] font-medium text-ink">Noch keine Stammkunden</p>
        <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-snug text-ink-3">
          Sobald ein Kunde die Karte über den QR-Code oder NFC-Chip abholt, steht er hier.
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
          placeholder="Name oder Kartennummer suchen"
          className="pl-9"
          aria-label="Stammkunden suchen"
        />
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">Kein Stammkunde passt auf „{query.trim()}".</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Kartennummer</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Mitglied seit</th>
                <th className="px-4 py-2.5 font-medium">Besuche</th>
                <th className="px-4 py-2.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const busy = busyId === row.passId
                return (
                  <tr key={row.passId} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      {row.holderName ?? <span className="font-normal text-ink-3">Ohne Namen</span>}
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-[12.5px] text-ink-2 sm:table-cell">{row.serial}</td>
                    <td className="hidden px-4 py-3 tabular-nums text-ink-2 md:table-cell">{row.memberSince}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-2">
                      {row.visits}
                      {row.lastVisit ? <span className="text-ink-3"> · zuletzt {row.lastVisit}</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Badge tone={row.blocked ? 'danger' : 'ok'}>{row.blocked ? 'Gesperrt' : 'Aktiv'}</Badge>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => toggle(row)}>
                          {busy ? <Spinner /> : row.blocked ? <Undo2 /> : <Ban />}
                          {row.blocked ? 'Entsperren' : 'Sperren'}
                        </Button>
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
