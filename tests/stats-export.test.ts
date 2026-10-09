import { describe, expect, it } from 'vitest'
import { exportFileBase, statsSheets, toCsv, toXlsx, type Sheet } from '@/lib/stats/stats-export'
import type { OrgStats } from '@/lib/stats/org-stats'

const stats: OrgStats = {
  customers: 40,
  newThisMonth: 2,
  active: 34,
  inactive: 6,
  inactiveAfterMonths: 2,
  weekly: [{ label: '05.10.', startsOn: '05.10.2026', customers: 40, new: 2 }],
  cards: [
    {
      id: 'c1',
      kind: 'STAMP',
      name: 'Kaffee; "Spezial" & <Tee>',
      stampGoal: 2,
      customers: 5,
      full: 1,
      redeemed: 3,
      distribution: [
        { stamps: 1, count: 4 },
        { stamps: 2, count: 1 },
      ],
    },
    { id: 'c2', kind: 'COUPON', name: 'Geburtstag', stampGoal: 10, customers: 0, full: 0, redeemed: 0, distribution: [] },
  ],
  coupons: [{ id: 'c2', name: '=HYPERLINK("x")', issued: 9, redeemed: 4, open: 5 }],
  members: [
    { id: 'c3', name: 'Stammgäste', members: 12, newThisMonth: 2, blocked: 1, visitsThisMonth: 30, activeThisMonth: 8 },
  ],
}

const generatedAt = new Date(Date.UTC(2026, 9, 5, 12, 30))
const sheets = statsSheets(stats, 'Café Nord', generatedAt)

describe('statsSheets', () => {
  it('legt sechs Tabellen an, Gutschein- und Stammkundenkarten nicht unter den Stempelkarten', () => {
    expect(sheets.map((s) => s.name)).toEqual([
      'Übersicht',
      'Neue Kunden pro Woche',
      'Stempelkarten',
      'Stempelstand',
      'Gutscheinkarten',
      'Stammkundenkarten',
    ])
    expect(sheets.at(-1)?.rows[1]).toEqual(['Stammgäste', 12, 2, 30, 8, 1])
    const stamp = sheets.find((s) => s.name === 'Stempelkarten') as Sheet
    expect(stamp.rows).toHaveLength(2)
    expect(sheets[0]?.rows[1]).toEqual(['Stand', '05.10.2026, 14:30 Uhr'])
  })
})

describe('toCsv', () => {
  const csv = toCsv(sheets)

  it('ist für ein deutsches Excel gemacht: BOM, Semikolon, CRLF', () => {
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Kunden mit Stempelkarte;40\r\n')
    expect(csv).toContain('Woche ab;Neue Kunden;Kunden gesamt\r\n05.10.2026;2;40')
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('maskiert Semikolons und Anführungszeichen in Namen', () => {
    expect(csv).toContain('"Kaffee; ""Spezial"" & <Tee>";2;5;1;3')
  })

  it('lässt Excel einen Namen nie als Formel ausführen', () => {
    expect(csv).toContain(`"'=HYPERLINK(""x"")";9;4;5`)
  })
})

describe('toXlsx', () => {
  // Der ZIP-Schreiber speichert unkomprimiert — der XML-Text steht lesbar im Archiv.
  const text = toXlsx(sheets).toString('utf8')

  it('enthält Arbeitsmappe, Stile und ein Blatt je Tabelle', () => {
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml']) {
      expect(text).toContain(part)
    }
    for (let i = 1; i <= 6; i++) expect(text).toContain(`xl/worksheets/sheet${i}.xml`)
    expect(text).toContain('<sheet name="Übersicht" sheetId="1" r:id="rId1"/>')
  })

  it('schreibt Zahlen als Zahlen, Text maskiert und Kopfzeilen fett', () => {
    expect(text).toContain('<c r="B4"><v>40</v></c>')
    expect(text).toContain('Kaffee; &quot;Spezial&quot; &amp; &lt;Tee&gt;')
    expect(text).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Woche ab</t>')
    // Ein Formel-Name bleibt Text: inlineStr, kein <f>.
    expect(text).toContain('<t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t>')
    expect(text).not.toContain('<f>')
  })
})

describe('exportFileBase', () => {
  it('macht aus dem Namen einen sauberen Dateinamen mit deutschem Datum', () => {
    expect(exportFileBase('Café Nord', generatedAt)).toBe('statistiken-cafe-nord-2026-10-05')
    expect(exportFileBase('Bäckerei Groß & Söhne', generatedAt)).toBe('statistiken-baeckerei-gross-soehne-2026-10-05')
    // 23:30 UTC ist in Berlin schon der nächste Tag.
    expect(exportFileBase('X', new Date(Date.UTC(2026, 9, 5, 23, 30)))).toBe('statistiken-x-2026-10-06')
  })
})
