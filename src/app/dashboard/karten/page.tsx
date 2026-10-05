import { redirect } from 'next/navigation'

/**
 * Die frühere Gesamtübersicht aller Karten gibt es nicht mehr — Karten stehen unter ihrem
 * Betrieb. Alte Lesezeichen und Links landen beim Betrieb bzw. bei der Betriebe-Liste.
 * (Editor und Kasse einer Karte bleiben unter /dashboard/karten/<id>.)
 */
export default async function KartenPage({
  searchParams,
}: {
  searchParams: Promise<{ betrieb?: string | string[] }>
}) {
  const { betrieb } = await searchParams
  redirect(
    typeof betrieb === 'string' && betrieb
      ? `/dashboard/kunden/${encodeURIComponent(betrieb)}`
      : '/dashboard/kunden',
  )
}
