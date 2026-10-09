'use client'

import * as React from 'react'
import { BadgeCheck, RotateCw, Search, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { QrScanner } from './qr-scanner'
import { checkMemberAction, type MemberCheckView as CheckResult } from '@/actions/members'

type Feedback =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'result'; result: CheckResult }
  | { kind: 'error'; message: string }

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

/**
 * Die Kasse für Stammkundenkarten: scannen, und sofort steht da, ob die Karte gilt und
 * wem sie gehört. Kein Stempeln, kein Einlösen — ein Scan ist eine Prüfung und zählt den
 * Besuch (höchstens einmal am Tag).
 */
export function MemberCheckView({
  cardId,
  initialSerial,
}: {
  cardId: string
  initialSerial?: string | null
}) {
  const [feedback, setFeedback] = React.useState<Feedback>({ kind: 'idle' })
  const [manual, setManual] = React.useState(initialSerial ?? '')
  const busyRef = React.useRef(false)

  const check = React.useCallback(
    async (scanned: string) => {
      if (busyRef.current) return
      busyRef.current = true
      setFeedback({ kind: 'busy' })
      try {
        const result = await checkMemberAction({ cardId, scanned })
        setFeedback(
          result.success
            ? { kind: 'result', result: result.data }
            : { kind: 'error', message: result.error.message },
        )
      } catch {
        setFeedback({ kind: 'error', message: 'Verbindung unterbrochen. Bitte erneut versuchen.' })
      } finally {
        busyRef.current = false
      }
    },
    [cardId],
  )

  const checkedInitial = React.useRef(false)
  React.useEffect(() => {
    if (!initialSerial || checkedInitial.current) return
    checkedInitial.current = true
    void check(initialSerial)
  }, [initialSerial, check])

  return (
    <div className="mx-auto w-full max-w-md space-y-4 p-4">
      <QrScanner onScan={(value) => void check(value)} disabled={feedback.kind === 'busy'} />

      <div className="space-y-1.5">
        <Label htmlFor="member-serial">
          Kartennummer von Hand
          <span className="ml-1 font-normal text-ink-3">— steht im Wallet unter dem Barcode</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="member-serial"
            value={manual}
            placeholder="K-3F9A12BC4D5E"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manual.trim()) void check(manual.trim())
            }}
          />
          <Button
            variant="primary"
            disabled={!manual.trim() || feedback.kind === 'busy'}
            onClick={() => void check(manual.trim())}
          >
            <Search />
            Prüfen
          </Button>
        </div>
      </div>

      <ResultPanel feedback={feedback} />

      {feedback.kind === 'result' || feedback.kind === 'error' ? (
        <Button variant="ghost" onClick={() => setFeedback({ kind: 'idle' })}>
          <RotateCw />
          Nächste Karte
        </Button>
      ) : null}
    </div>
  )
}

function ResultPanel({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === 'idle') {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-[13px] text-ink-3">
        Stammkundenkarte scannen oder Nummer eingeben.
      </p>
    )
  }
  if (feedback.kind === 'busy') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-8 text-[13px] text-ink-2">
        <Spinner />
        Wird geprüft …
      </div>
    )
  }
  if (feedback.kind === 'error') {
    return (
      <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-4 text-[13px] text-danger">
        {feedback.message}
      </div>
    )
  }

  const r = feedback.result
  if (!r.valid) {
    return (
      <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-5">
        <p className="flex items-center gap-2 text-[16px] font-semibold text-danger">
          <ShieldX className="size-5" />
          Nicht gültig
        </p>
        <p className="mt-1 text-[13px] text-danger">{r.message}</p>
        {r.holderName ? <p className="mt-2 text-[13px] text-ink-2">Karte von {r.holderName}</p> : null}
      </div>
    )
  }

  return (
    <div role="status" className="rounded-lg border border-ok/30 bg-ok-soft px-4 py-5">
      <p className="flex items-center gap-2 text-[16px] font-semibold text-ok">
        <BadgeCheck className="size-5" />
        Stammkunde — gültig
      </p>
      <p className="mt-2 text-[22px] font-semibold leading-tight text-ink">
        {r.holderName ?? 'Ohne Namen'}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
        <dt className="text-ink-3">Mitglied seit</dt>
        <dd className="text-ink-2">{r.memberSince ? dateFormat.format(new Date(r.memberSince)) : '—'}</dd>
        <dt className="text-ink-3">Besuche</dt>
        <dd className="text-ink-2">
          {r.visits ?? 0}
          {r.visitCounted ? ' (heute gezählt)' : ' (heute schon gezählt)'}
        </dd>
        <dt className="text-ink-3">Kartennummer</dt>
        <dd className="font-mono text-ink-2">{r.serial}</dd>
      </dl>
      {r.isTest ? <p className="mt-2 text-[12px] text-ink-3">Testkarte</p> : null}
    </div>
  )
}
