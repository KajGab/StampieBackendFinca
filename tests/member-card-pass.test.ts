import { describe, expect, it } from 'vitest'
import { buildPassJson, type BuildPassJsonContext } from '@/lib/cards/apple-pass-json'
import { buildLoyaltyClass, buildLoyaltyObject } from '@/lib/cards/google-loyalty'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Die Stammkundenkarte: eine Stempelkarte ohne Stempel. Im Wallet soll sie wie die
 * Stempelkarte desselben Betriebs aussehen, aber nichts zählen — und den Namen tragen, an
 * dem das Personal an der Kasse erkennt, wem sie gehört.
 */

const design = (over: Partial<CardDesignInput> = {}): CardDesignInput => ({
  ...DEFAULT_CARD_DESIGN,
  programName: 'Finca Stammkunden',
  rewardText: '10 % auf alle Getränke',
  ...over,
})

const ctx: BuildPassJsonContext = {
  serial: 'K-ABC123',
  currentStamps: 0,
  organizationName: 'Finca',
  passTypeIdentifier: 'pass.de.stampie.card',
  teamIdentifier: 'ABCDE12345',
  barcodeMessage: 'https://stampie.de/s/K-ABC123',
  kind: 'MEMBER',
  customerName: 'Erika Musterfrau',
  memberSince: new Date('2026-10-09T10:00:00Z'),
}

describe('Apple-Pass der Stammkundenkarte', () => {
  const pass = buildPassJson(design(), ctx)
  const card = pass.storeCard

  it('ist eine storeCard wie die Stempelkarte, kein Gutschein', () => {
    expect(card).toBeDefined()
    expect(pass.coupon).toBeUndefined()
  })

  it('zeigt statt des Zählers „Stammkunde" und groß den Namen', () => {
    expect(card?.headerFields).toEqual([
      { key: 'status', label: 'Status', value: 'Stammkunde', textAlignment: 'PKTextAlignmentRight' },
    ])
    // Ohne Beschriftung — Wallet setzte sie sonst unter den Namen.
    expect(card?.primaryFields).toEqual([{ key: 'holder', value: 'Erika Musterfrau' }])
    expect(JSON.stringify(card)).not.toContain('/10')
  })

  it('nennt den Vorteil und das Mitgliedsdatum, den Namen nicht doppelt', () => {
    expect(card?.secondaryFields).toContainEqual({ key: 'reward', label: 'Vorteil', value: '10 % auf alle Getränke' })
    expect(card?.auxiliaryFields).toEqual([{ key: 'member-since', label: 'Mitglied seit', value: '09.10.2026' }])
  })

  it('trägt die Kartennummer im Barcode — daran prüft die Kasse', () => {
    expect(pass.barcode.message).toBe('https://stampie.de/s/K-ABC123')
    expect(pass.barcode.altText).toBe('K-ABC123')
  })
})

describe('Google-Pass der Stammkundenkarte', () => {
  const gctx = {
    issuerId: '3388000000000000000',
    classSuffix: 'card_1',
    objectSuffix: 'sn_K-ABC123',
    issuerName: 'Finca',
    serial: 'K-ABC123',
    currentStamps: 0,
    barcodeMessage: 'https://stampie.de/s/K-ABC123',
    heroUrl: 'https://stampie.de/api/wallet/hero/1?s=0',
    kind: 'MEMBER' as const,
    customerName: 'Erika Musterfrau',
    memberSince: new Date('2026-10-09T10:00:00Z'),
  }

  it('zeigt statt des Stempelstands den Namen und hat kein Stempelbild', () => {
    const obj = buildLoyaltyObject(design(), gctx)
    // `accountName` steht bei Google nur in den Details — auf der Vorderseite ist das der Platz.
    expect(obj.loyaltyPoints).toEqual({ label: 'Stammkunde', balance: { string: 'Erika Musterfrau' } })
    expect(obj.heroImage).toBeUndefined()
    expect(buildLoyaltyClass(design(), gctx).heroImage).toBeUndefined()
  })

  it('zeigt immer den Namen, auch ohne die Designer-Option', () => {
    const obj = buildLoyaltyObject(design({ googleAccountNameEnabled: false }), gctx)
    expect(obj.accountName).toBe('Erika Musterfrau')
    expect(buildLoyaltyClass(design(), gctx).accountNameLabel).toBe('Name')
  })

  it('nennt das Mitgliedsdatum und den Vorteil', () => {
    const obj = buildLoyaltyObject(design(), gctx)
    expect(obj.textModulesData?.[0]).toEqual({ id: 'member-since', header: 'Mitglied seit', body: '09.10.2026' })
    expect(buildLoyaltyClass(design(), gctx).textModulesData?.[0]?.header).toBe('Vorteil')
  })

  it('lässt die Stempelkarte unverändert', () => {
    const stampCtx = { ...gctx, kind: 'STAMP' as const, customerName: null, currentStamps: 6 }
    expect(buildLoyaltyObject(design(), stampCtx).loyaltyPoints?.balance.string).toBe('6/10')
  })
})
