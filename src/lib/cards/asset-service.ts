import 'server-only'
import { prisma } from '@/lib/db'
import { getStorage, variantKey } from '@/lib/storage'
import type { PassAssets, ScaledPng } from '@/lib/pass/pass-builder'
import type { CardDesignInput } from './schema'
import { stampImageSequence } from './stamp-icons'

/**
 * Resolves the asset ids on a design to actual bytes. Kept out of `render-strip.ts` so
 * the renderer stays IO-free and unit-testable; every caller that needs pixels goes
 * through here.
 *
 * Every lookup is scoped by `cardId` — an asset id from another tenant simply does
 * not resolve.
 */

async function loadVariant(
  cardId: string,
  assetId: string | null,
  scale: 1 | 2 | 3,
): Promise<Buffer | null> {
  if (!assetId) return null
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, cardId },
    select: { storageKey: true },
  })
  if (!asset) return null
  const storage = await getStorage()
  return storage.get(variantKey(asset.storageKey, scale))
}

/**
 * Mehrere Assets in der gegebenen Reihenfolge, Doppelte eingeschlossen (dasselbe Bild darf
 * zweimal in der Stempelreihe stehen). Was nicht zu dieser Karte gehört, fällt weg.
 */
async function loadVariants(cardId: string, assetIds: readonly string[], scale: 1 | 2 | 3): Promise<Buffer[]> {
  if (assetIds.length === 0) return []
  const assets = await prisma.asset.findMany({
    where: { id: { in: [...new Set(assetIds)] }, cardId },
    select: { id: true, storageKey: true },
  })
  const storage = await getStorage()
  const bytes = new Map(
    await Promise.all(
      assets.map(async (a) => [a.id, await storage.get(variantKey(a.storageKey, scale))] as const),
    ),
  )
  return assetIds.map((id) => bytes.get(id)).filter((b): b is Buffer => b != null)
}

async function loadScaled(cardId: string, assetId: string | null): Promise<ScaledPng | null> {
  if (!assetId) return null
  const [one, two, three] = await Promise.all([
    loadVariant(cardId, assetId, 1),
    loadVariant(cardId, assetId, 2),
    loadVariant(cardId, assetId, 3),
  ])
  if (!one) return null
  const result: ScaledPng = { '1x': one }
  if (two) result['2x'] = two
  if (three) result['3x'] = three
  return result
}

async function publicUrlFor(cardId: string, assetId: string | null): Promise<string | null> {
  if (!assetId) return null
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, cardId },
    select: { storageKey: true },
  })
  if (!asset) return null
  const storage = await getStorage()
  return storage.publicUrl(variantKey(asset.storageKey, 1))
}

export async function loadPassAssets(
  design: CardDesignInput,
  cardId: string,
): Promise<PassAssets> {
  const [icon, logo, stampIcon, stampIcons, hero, logoUrl, heroUrl] = await Promise.all([
    loadScaled(cardId, design.iconAssetId),
    loadScaled(cardId, design.logoAssetId),
    loadVariant(cardId, design.stampIconAssetId, 1),
    loadVariants(cardId, stampImageSequence(design), 1),
    loadVariant(cardId, design.heroAssetId, 1),
    publicUrlFor(cardId, design.logoAssetId),
    publicUrlFor(cardId, design.heroAssetId),
  ])

  return { icon, logo, stampIcon, stampIcons, hero, logoUrl, heroUrl }
}

/** Only what the strip renderer needs — cheaper than loading the whole asset set. */
export async function loadStripAssets(
  design: Pick<CardDesignInput, 'stampIcon' | 'stampIconAssetId' | 'stampIconAssetIds' | 'heroAssetId'>,
  cardId: string,
): Promise<{ customIconPng: Buffer | null; customIconPngs: Buffer[]; backgroundPng: Buffer | null }> {
  const [customIconPng, customIconPngs, backgroundPng] = await Promise.all([
    loadVariant(cardId, design.stampIconAssetId, 1),
    loadVariants(cardId, stampImageSequence(design), 1),
    loadVariant(cardId, design.heroAssetId, 1),
  ])
  return { customIconPng, customIconPngs, backgroundPng }
}
