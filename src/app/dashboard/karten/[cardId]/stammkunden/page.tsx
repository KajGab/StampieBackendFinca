import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { assertCardAccess, CardAccessError, UnauthorizedError } from '@/lib/auth/session'
import { LogoutButton } from '@/components/logout-button'
import { prisma } from '@/lib/db'
import { listMembers } from '@/lib/cards/member-check'
import { MemberList, type MemberListRow } from './_components/member-list'

export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

/**
 * Die Stammkunden einer Stammkundenkarte: wer sie hat, seit wann, wie oft er da war — und
 * die Möglichkeit, eine Karte zu sperren. Eine gesperrte Karte gilt an der Kasse als
 * ungültig; der Pass bleibt beim Kunden, damit nichts still verschwindet.
 */
export default async function StammkundenPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params

  let access
  try {
    access = await assertCardAccess(cardId)
  } catch (e) {
    if (e instanceof CardAccessError || e instanceof UnauthorizedError) notFound()
    throw e
  }
  if (access.session.mustChangePassword) redirect('/dashboard/konto')

  const card = await prisma.card.findFirst({
    where: { id: access.cardId },
    select: { name: true, kind: true, orgId: true, org: { select: { name: true } } },
  })
  if (!card || card.kind !== 'MEMBER') notFound()

  const rows: MemberListRow[] = (await listMembers(access.cardId)).map((m) => ({
    passId: m.passId,
    serial: m.serial,
    holderName: m.holderName,
    memberSince: dateFormat.format(m.memberSince),
    blocked: m.blockedAt !== null,
    visits: m.visits,
    lastVisit: m.lastVisitAt ? dateFormat.format(m.lastVisitAt) : null,
  }))
  const backHref = card.orgId ? `/dashboard/kunden/${encodeURIComponent(card.orgId)}` : '/dashboard/kunden'

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
            <Link href="/dashboard/konto" className="text-[12px] text-ink-3 transition-colors hover:text-ink">
              {access.session.email}
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-[12px] text-ink-3 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3" />
            {card.org?.name ?? 'Alle Betriebe'}
          </Link>
          <h1 className="text-[17px] font-semibold text-ink">Stammkunden</h1>
          <p className="max-w-prose text-[13px] leading-snug text-ink-3">
            {card.name}: alle Kunden mit dieser Stammkundenkarte. Eine gesperrte Karte gilt an der
            Kasse als ungültig, bleibt aber im Wallet des Kunden.
          </p>
        </div>

        <MemberList rows={rows} />
      </main>
    </div>
  )
}
