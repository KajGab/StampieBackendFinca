import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { buildStripSvg, type StripSvgInput } from '@/lib/cards/strip-svg'
import { renderStripImage } from '@/lib/cards/render-strip'
import { APPLE_STRIP_CANVAS } from '@/lib/cards/stamp-layout'
import { customStampImageIds, sequenceIndexFor, stampImageSequence, stampSequenceHint } from '@/lib/cards/stamp-icons'
import { cardDesignDraftSchema } from '@/lib/cards/schema'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { stripPreviewUrl } from '@/lib/cards/preview-url'
import { walletHeroUrl } from '@/lib/wallet/image-urls'

/**
 * Mehrere Stempelbilder: Stempel 1 trägt das erste Bild, Stempel 2 das zweite … und nach
 * dem letzten geht es von vorne los. Ein Fehler hier heißt: der Kunde sieht im Wallet
 * andere Stempel als der Betrieb im Editor eingestellt hat.
 */

const base = (over: Partial<StripSvgInput> = {}): StripSvgInput => ({
  stampGoal: 5,
  currentStamps: 5,
  foregroundColor: '#ffffff',
  backgroundColor: '#000000',
  stampIcon: 'custom',
  emptyStampStyle: 'outline',
  customIconBase64: 'AAAA',
  ...over,
})

/** Die Bilder in der Reihenfolge, in der sie im SVG stehen. */
const imagesIn = (svg: string) => [...svg.matchAll(/base64,([A-Z]+)"/g)].map((m) => m[1])

describe('Stempelbilder der Reihe nach', () => {
  it('gibt jedem Stempel sein Bild und fängt nach dem letzten von vorne an', () => {
    const svg = buildStripSvg(base({ customIconSequenceBase64: ['AAAA', 'BBBB', 'CCCC'] }), APPLE_STRIP_CANVAS)
    expect(imagesIn(svg)).toEqual(['AAAA', 'BBBB', 'CCCC', 'AAAA', 'BBBB'])
  })

  it('zeigt bei „transparent" auf den offenen Plätzen schon das Bild, das dort hinkommt', () => {
    const svg = buildStripSvg(
      base({ currentStamps: 2, emptyStampStyle: 'transparent', customIconSequenceBase64: ['AAAA', 'BBBB', 'CCCC'] }),
      APPLE_STRIP_CANVAS,
    )
    expect(imagesIn(svg)).toEqual(['AAAA', 'BBBB', 'CCCC', 'AAAA', 'BBBB'])
    expect(svg.match(/opacity="0.25"/g)).toHaveLength(3)
  })

  it('zeichnet offene Plätze bei „outline" weiter als Kreis, ohne Bild', () => {
    const svg = buildStripSvg(base({ currentStamps: 2, customIconSequenceBase64: ['AAAA', 'BBBB'] }), APPLE_STRIP_CANVAS)
    expect(imagesIn(svg)).toEqual(['AAAA', 'BBBB'])
    expect(svg.match(/<circle /g)).toHaveLength(3)
  })

  it('nimmt ohne Reihe das eine Bild für alle Stempel, wie bisher', () => {
    expect(imagesIn(buildStripSvg(base({ customIconSequenceBase64: [] }), APPLE_STRIP_CANVAS))).toEqual([
      'AAAA',
      'AAAA',
      'AAAA',
      'AAAA',
      'AAAA',
    ])
  })

  it('rendert eine Reihe aus echten Bildern zu einem PNG in Wallet-Größe', async () => {
    const square = (r: number, g: number, b: number) =>
      sharp({ create: { width: 128, height: 128, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer()
    const png = await renderStripImage(
      { stampGoal: 4, foregroundColor: '#ffffff', backgroundColor: '#000000', stampIcon: 'custom', emptyStampStyle: 'outline' },
      4,
      2,
      { customIconPngs: [await square(255, 0, 0), await square(0, 0, 255)] },
    )
    const meta = await sharp(png).metadata()
    expect([meta.width, meta.height]).toEqual([750, 246])
  })
})

describe('stampImageSequence', () => {
  it('gilt nur für hochgeladene Bilder — ein Symbol oder Emoji gilt für alle Stempel', () => {
    expect(stampImageSequence({ stampIcon: 'custom', stampIconAssetIds: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(stampImageSequence({ stampIcon: 'coffee', stampIconAssetIds: ['a', 'b'] })).toEqual([])
    expect(stampImageSequence({ stampIcon: 'emoji:2615', stampIconAssetIds: ['a', 'b'] })).toEqual([])
  })

  it('zählt der Reihe nach und fängt von vorne an', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => sequenceIndexFor(i, 3))).toEqual([0, 1, 2, 0, 1, 2, 0])
  })
})

describe('Editor', () => {
  it('zeigt eine ältere Karte mit nur einem Bild als Reihe aus diesem einen Bild', () => {
    expect(customStampImageIds({ stampIcon: 'custom', stampIconAssetId: 'a', stampIconAssetIds: [] })).toEqual(['a'])
    expect(customStampImageIds({ stampIcon: 'custom', stampIconAssetId: 'a', stampIconAssetIds: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(customStampImageIds({ stampIcon: 'emoji:2615', stampIconAssetId: 'e', stampIconAssetIds: [] })).toEqual([])
  })

  it('sagt, welcher Stempel welches Bild bekommt', () => {
    expect(stampSequenceHint(1, 10)).toContain('Alle Stempel tragen dieses Bild')
    expect(stampSequenceHint(3, 10)).toContain('Nach Bild 3 geht es wieder mit Bild 1 los')
    expect(stampSequenceHint(10, 10)).toContain('Jeder der 10 Stempel hat sein eigenes Bild')
    expect(stampSequenceHint(11, 10)).toContain('Bild 11 kommt nicht vor')
    expect(stampSequenceHint(12, 10)).toContain('Bild 11 bis 12 kommen nicht vor')
  })
})

describe('Entwurf und Adressen', () => {
  const ids = ['ckv0000000000000000000001', 'ckv0000000000000000000002']
  const design = { ...DEFAULT_CARD_DESIGN, stampIcon: 'custom', stampIconAssetId: ids[0]!, stampIconAssetIds: ids }

  it('nimmt bis zu 20 Bilder an und hat ohne Angabe eine leere Reihe', () => {
    expect(cardDesignDraftSchema.parse(design).stampIconAssetIds).toEqual(ids)
    const { stampIconAssetIds: _omit, ...withoutList } = DEFAULT_CARD_DESIGN
    expect(cardDesignDraftSchema.parse(withoutList).stampIconAssetIds).toEqual([])
    const tooMany = Array.from({ length: 21 }, () => ids[0]!)
    expect(cardDesignDraftSchema.safeParse({ ...design, stampIconAssetIds: tooMany }).success).toBe(false)
  })

  it('gibt die Reihe an die Vorschau weiter und ändert die Google-Bildadresse mit ihr', () => {
    const url = new URL(stripPreviewUrl(design, { cardId: 'card', currentStamps: 2 }), 'http://x')
    expect(url.searchParams.get('iconAssets')).toBe(ids.join(','))
    const reordered = { ...design, stampIconAssetIds: [...ids].reverse() }
    expect(walletHeroUrl('https://x', 'card', reordered, 2)).not.toBe(walletHeroUrl('https://x', 'card', design, 2))
  })

  it('lässt Adressen von Karten ohne Reihe unverändert', () => {
    const url = new URL(stripPreviewUrl(DEFAULT_CARD_DESIGN, { cardId: 'card', currentStamps: 2 }), 'http://x')
    expect(url.searchParams.has('iconAssets')).toBe(false)
  })
})
