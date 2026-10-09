import { createZip } from '@/lib/pass/zip'
import type { OrgStats } from './org-stats'

/**
 * Die Statistiken eines Betriebs als Datei — Excel (.xlsx) oder CSV.
 *
 * Beide Formate entstehen aus denselben Tabellen (`statsSheets`): in der Excel-Datei je ein
 * Blatt, in der CSV-Datei untereinander mit Leerzeile dazwischen. So steht in beiden
 * dasselbe, und die Seite im Dashboard rechnet mit derselben Funktion (`loadOrgStats`).
 *
 * Die .xlsx wird von Hand gebaut: sie ist ein ZIP mit ein paar XML-Dateien, und den
 * ZIP-Schreiber gibt es für die Wallet-Pässe ohnehin. Eine Bibliothek dafür wäre die
 * größere Angriffsfläche als die paar Zeilen hier.
 */

export type Cell = string | number | null

export interface Sheet {
  /** Blattname in Excel (höchstens 31 Zeichen), in der CSV die Überschrift. */
  name: string
  /** Erste Zeile ist die Kopfzeile, außer bei `noHeader`. */
  rows: Cell[][]
  noHeader?: boolean
}

const dateTime = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function statsSheets(stats: OrgStats, betriebName: string, generatedAt: Date): Sheet[] {
  const m = stats.inactiveAfterMonths
  const stampCards = stats.cards.filter((c) => c.kind === 'STAMP')

  return [
    {
      name: 'Übersicht',
      noHeader: true,
      rows: [
        ['Betrieb', betriebName],
        ['Stand', `${dateTime.format(generatedAt)} Uhr`],
        [],
        ['Kunden mit Stempelkarte', stats.customers],
        ['Neu in diesem Monat', stats.newThisMonth],
        [`Aktiv (Besuch in den letzten ${m} ${m === 1 ? 'Monat' : 'Monaten'})`, stats.active],
        [`Inaktiv (länger als ${m} ${m === 1 ? 'Monat' : 'Monate'} nicht da)`, stats.inactive],
        [],
        ['Testkarten zählen nicht mit. Ein Handy zählt als ein Kunde, auch mit mehreren Karten.'],
      ],
    },
    {
      name: 'Neue Kunden pro Woche',
      rows: [
        ['Woche ab', 'Neue Kunden', 'Kunden gesamt'],
        ...stats.weekly.map((w): Cell[] => [w.startsOn, w.new, w.customers]),
      ],
    },
    {
      name: 'Stempelkarten',
      rows: [
        ['Karte', 'Stempel-Ziel', 'Kunden', 'Karte voll', 'Belohnungen eingelöst'],
        ...stampCards.map((c): Cell[] => [c.name, c.stampGoal, c.customers, c.full, c.redeemed]),
      ],
    },
    {
      name: 'Stempelstand',
      rows: [
        ['Karte', 'Stempel', 'Kunden'],
        ...stampCards.flatMap((c) => c.distribution.map((d): Cell[] => [c.name, d.stamps, d.count])),
      ],
    },
    {
      name: 'Gutscheinkarten',
      rows: [
        ['Karte', 'Ausgegeben', 'Eingelöst', 'Offen'],
        ...stats.coupons.map((c): Cell[] => [c.name, c.issued, c.redeemed, c.open]),
      ],
    },
    {
      name: 'Stammkundenkarten',
      rows: [
        ['Karte', 'Stammkunden', 'Neu in diesem Monat', 'Besuche in diesem Monat', 'Diesen Monat da', 'Gesperrt'],
        ...stats.members.map((m): Cell[] => [
          m.name,
          m.members,
          m.newThisMonth,
          m.visitsThisMonth,
          m.activeThisMonth,
          m.blocked,
        ]),
      ],
    },
  ]
}

// ------------------------------------------------------------------------------ CSV

/**
 * CSV so, wie ein deutsches Excel sie ohne Import-Dialog richtig öffnet: Semikolon als
 * Trenner, UTF-8 mit BOM (sonst werden Umlaute zu Zeichensalat), Zeilenende CRLF.
 */
export function toCsv(sheets: Sheet[]): string {
  const blocks = sheets.map((sheet) =>
    [[sheet.name], ...sheet.rows].map((row) => row.map(csvCell).join(';')).join('\r\n'),
  )
  return '﻿' + blocks.join('\r\n\r\n') + '\r\n'
}

function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  // Ein Name wie „=HYPERLINK(…)" würde Excel beim Öffnen als Formel ausführen.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

// ----------------------------------------------------------------------------- XLSX

export function toXlsx(sheets: Sheet[]): Buffer {
  const entry = (name: string, xml: string) => ({ name, data: Buffer.from(xml, 'utf8') })

  const sheetEntries = sheets.map((sheet, i) => entry(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)))

  return createZip([
    entry(
      '[Content_Types].xml',
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ),
    entry(
      '_rels/.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    entry(
      'xl/workbook.xml',
      `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
        sheets
          .map((s, i) => `<sheet name="${xmlEscape(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('') +
        '</sheets></workbook>',
    ),
    entry(
      'xl/_rels/workbook.xml.rels',
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    // Stil 0 = normal, Stil 1 = fett (Kopfzeilen). Füllungen 0 und 1 verlangt Excel immer.
    entry(
      'xl/styles.xml',
      `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    ),
    ...sheetEntries,
  ])
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function sheetXml(sheet: Sheet): string {
  const columnCount = Math.max(1, ...sheet.rows.map((r) => r.length))
  // Breite nach dem längsten Eintrag je Spalte, in Zeichen wie Excel rechnet — gedeckelt,
  // damit ein einzelner langer Hinweis die Spalte nicht aufbläht.
  const cols = Array.from({ length: columnCount }, (_, col) => {
    const width = Math.min(45, Math.max(10, ...sheet.rows.map((r) => String(r[col] ?? '').length + 2)))
    return `<col min="${col + 1}" max="${col + 1}" width="${width}" customWidth="1"/>`
  }).join('')

  const rows = sheet.rows
    .map((row, r) => {
      const bold = !sheet.noHeader && r === 0
      const cells = row
        .map((value, c) => {
          if (value === null || value === undefined || value === '') return ''
          const ref = `${columnLetter(c)}${r + 1}`
          const style = bold ? ' s="1"' : ''
          if (typeof value === 'number') return `<c r="${ref}"${style}><v>${value}</v></c>`
          // Inline-Text statt Formel: was hier steht, rechnet Excel nie aus.
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')

  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}"><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`
}

function columnLetter(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** Excel erlaubt höchstens 31 Zeichen und keines von []:*?/\ im Blattnamen. */
function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31)
}

function xmlEscape(value: string): string {
  return (
    value
      // Steuerzeichen sind in XML 1.0 verboten und machen die ganze Datei unlesbar.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/** Dateiname ohne Umlaute und Sonderzeichen, z. B. „statistiken-cafe-nord-2026-10-05“. */
export function exportFileBase(betriebName: string, generatedAt: Date): string {
  const slug =
    betriebName
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'betrieb'
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(generatedAt)
  return `statistiken-${slug}-${day}`
}
