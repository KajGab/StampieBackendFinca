import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAppUser } from '@/lib/auth/app-session'

export const runtime = 'nodejs'

/** The logged-in business's card programmes — so the app can pick which one to hand out. */
export async function GET(request: Request): Promise<Response> {
  const appUser = await requireAppUser(request)
  if (!appUser) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

  const cards = await prisma.card.findMany({
    where: { orgId: appUser.orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      kind: true,
      nfcCode: true,
      designs: { select: { status: true, stampGoal: true, programName: true, offerTitle: true } },
    },
  })

  const result = cards.map((c) => {
    const published = c.designs.find((d) => d.status === 'PUBLISHED')
    const source = published ?? c.designs.find((d) => d.status === 'DRAFT') ?? null
    return {
      id: c.id,
      name: c.name,
      programName: source?.programName?.trim() || c.name,
      /** Stempel-, Gutschein- oder Stammkundenkarte (STAMP/COUPON/MEMBER) — die App zeigt das beim Ausgeben an. */
      kind: c.kind,
      stampGoal: source?.stampGoal ?? 10,
      /** Nur bei Gutscheinkarten sinnvoll, z. B. "20 % auf alles". */
      offerTitle: source?.offerTitle?.trim() || null,
      isPublished: published !== undefined,
      /** Ob der Ausgabe-Link schon geprägt ist — die App zeigt sonst, dass er entsteht. */
      hasHandout: c.nfcCode !== null,
    }
  })

  return NextResponse.json({ cards: result })
}
