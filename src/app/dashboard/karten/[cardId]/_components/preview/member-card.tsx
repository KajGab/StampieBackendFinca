'use client'

import { resolveIssuerName } from '@/lib/cards/issuer'
import { readableOn } from '@/lib/color/contrast'
import { BarcodePlaceholder } from './barcode-placeholder'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Vorderseiten der Stammkundenkarte — eine Stempelkarte ohne Stempel.
 *
 * Dieselbe Anordnung wie `AppleStoreCard` bzw. `GoogleLoyaltyCard`, nur ohne Zähler und
 * ohne Stempelreihe: dort, wo die Stempelkarte ihren Stand zeigt, steht der Name des
 * Kunden. So wie `buildPassJson` und `buildLoyaltyObject` es für den echten Pass bauen.
 */

/** Platzhalter — im Editor gibt es noch keinen Kunden. */
const SAMPLE_NAME = 'Max Mustermann'
const SAMPLE_SINCE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(new Date())

export function AppleMemberCard({
  design,
  logoUrl,
  organizationName,
}: {
  design: CardDesignInput
  logoUrl: string | null
  organizationName: string
}) {
  // Eine storeCard ohne Streifen setzt secondary- und auxiliaryFields in eine Zeile —
  // „Mitglied seit" steht also neben Vorteil und Programm, nicht darunter.
  const fields = [
    design.rewardText.trim() ? { label: 'VORTEIL', value: design.rewardText.trim() } : null,
    design.programName.trim() ? { label: 'PROGRAMM', value: design.programName.trim() } : null,
    { label: 'MITGLIED SEIT', value: SAMPLE_SINCE },
  ].filter((f): f is { label: string; value: string } => f !== null)

  return (
    <div
      className="w-[336px] overflow-hidden rounded-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-[26px] w-auto max-w-[110px] object-contain object-left" />
          ) : (
            <span className="truncate text-[13px] font-semibold leading-tight">
              {resolveIssuerName(design, organizationName)}
            </span>
          )}
          {design.cardTitle?.trim() ? (
            <span className="truncate text-[12px] opacity-80">{design.cardTitle.trim()}</span>
          ) : null}
        </div>
        <div className="shrink-0 text-right leading-none">
          <div className="text-[9px] font-medium uppercase tracking-[0.06em]" style={{ color: design.labelColor }}>
            Status
          </div>
          <div className="mt-1 text-[15px] font-semibold">Stammkunde</div>
        </div>
      </div>

      {/* primaryFields — ohne Stempelreihe sichtbar: der Name, groß und ohne Beschriftung. */}
      <div className="px-3.5 pb-4 pt-5">
        <div className="truncate text-[26px] font-normal leading-tight">{SAMPLE_NAME}</div>
      </div>

      <div className="flex justify-between gap-3 px-3.5 pb-1 pt-2">
        {fields.map((f) => (
          // Das Datum ist kurz und wird nie gekürzt; Vorteil und Programm teilen sich den Rest.
          <div key={f.label} className={f.label === 'MITGLIED SEIT' ? 'shrink-0' : 'min-w-0'}>
            <div
              className="truncate text-[9px] font-medium uppercase tracking-[0.06em]"
              style={{ color: design.labelColor }}
            >
              {f.label}
            </div>
            <div className="truncate text-[12px] font-medium">{f.value}</div>
          </div>
        ))}
      </div>

      <div className="px-3.5 pb-3.5 pt-6">
        <div className="mx-auto flex w-[132px] flex-col items-center rounded-md bg-white p-2">
          <BarcodePlaceholder format={design.barcodeFormat} />
          <span className="mt-1 text-[8px] tracking-widest text-black/60">SN-DEMO-0001</span>
        </div>
      </div>
    </div>
  )
}

export function GoogleMemberCard({
  design,
  logoUrl,
  organizationName,
}: {
  design: CardDesignInput
  logoUrl: string | null
  organizationName: string
}) {
  // Google wählt die Schriftfarbe selbst nach dem Hintergrund — die Vorschau auch.
  const ink = readableOn(design.backgroundColor)
  const muted = ink === '#ffffff' ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.6)'

  return (
    <div
      className="w-[336px] overflow-hidden rounded-[14px] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ backgroundColor: design.backgroundColor, color: ink }}
    >
      <div className="flex items-start gap-2.5 px-4 pb-3 pt-4">
        <div
          className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ backgroundColor: ink === '#ffffff' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-full object-contain" />
          ) : (
            <span className="text-[12px] font-semibold">{organizationName.slice(0, 1) || 'S'}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 self-center text-[14px] font-medium leading-tight">
          {resolveIssuerName(design, organizationName)}
        </div>
      </div>

      {/* loyaltyPoints: bei der Stammkundenkarte „Stammkunde" + Name statt „Stempel 6/10". */}
      <div className="px-4 pb-3">
        <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: muted }}>
          Stammkunde
        </div>
        <div className="text-[24px] font-normal leading-tight">{SAMPLE_NAME}</div>
      </div>

      <div className="flex justify-center px-4 pb-4">
        <div className="flex flex-col items-center rounded-md bg-white p-3">
          <BarcodePlaceholder format={design.barcodeFormat} />
          <span className="mt-1 text-[10px] tracking-wider text-black/70">SN-DEMO-0001</span>
        </div>
      </div>
    </div>
  )
}
