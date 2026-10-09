'use client'

import * as React from 'react'
import { ArrowLeft, ArrowRight, Plus, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CUSTOM_ICON_KEY, customStampImageIds, stampSequenceHint, STAMP_ICONS } from '@/lib/cards/stamp-icons'
import { STAMP_GOAL_MAX } from '@/lib/cards/schema'
import { DEFAULT_CARD_DESIGN } from '@/lib/cards/defaults'
import { uploadAssetAction } from '@/actions/assets'
import { MAX_UPLOAD_BYTES } from '@/lib/images/upload-constraints'
import { useCardEditor, useCardEditorStore } from '@/stores/card-editor-provider'
import { cn } from '@/lib/utils'

const EMOJI_SUGGESTIONS = [
  '☕', '🍕', '✂️', '🍦', '🥙', '🧁', '💅', '❤️', '⭐', '✅',
  '🐾', '🍺', '🍔', '🌸', '🥐', '🍩', '🍰', '🍜', '🌮', '🥗',
  '🍣', '🧋', '🍫', '🚗', '💈', '💇', '🪒', '🧼', '🎁', '🏆',
] as const

/**
 * Stamp icon selection: curated library, emoji, or own uploads.
 *
 * Emoji are rasterised *in the browser* and uploaded like any other custom icon. The
 * server has no colour emoji font, so rendering them server-side would either need a
 * bundled emoji sprite set or produce empty boxes — this way the platform the user is
 * already looking at draws the glyph they picked.
 *
 * Eigene Bilder dürfen mehrere sein: Stempel 1 bekommt das erste, Stempel 2 das zweite …
 * und nach dem letzten geht es von vorne los. Ein einzelnes Bild gilt für alle Stempel.
 */
export function StampIconPicker() {
  const cardId = useCardEditor((s) => s.cardId)
  const store = useCardEditorStore()
  const stampIcon = useCardEditor((s) => s.design.stampIcon)
  const stampGoal = useCardEditor((s) => s.design.stampGoal)
  const stampIconAssetId = useCardEditor((s) => s.design.stampIconAssetId)
  const stampIconAssetIds = useCardEditor((s) => s.design.stampIconAssetIds)
  // Abgeleitet statt im Selektor gebaut: ein neues Array pro Store-Abfrage ließe React
  // endlos neu zeichnen.
  const customImages = React.useMemo(
    () => customStampImageIds({ stampIcon, stampIconAssetId, stampIconAssetIds }),
    [stampIcon, stampIconAssetId, stampIconAssetIds],
  )
  const patch = useCardEditor((s) => s.patch)
  const setAssetUrl = useCardEditor((s) => s.setAssetUrl)
  const assetUrls = useCardEditor((s) => s.assetUrls)

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /** Hinweis, nachdem das letzte eigene Bild entfernt wurde. */
  const [notice, setNotice] = React.useState<string | null>(null)
  const [customEmoji, setCustomEmoji] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)

  /** Lädt ein Bild hoch und gibt seine Asset-Id zurück — oder null, Fehler steht dann da. */
  const upload = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.set('cardId', cardId)
    formData.set('kind', 'STAMP_ICON')
    formData.set('file', file)

    const result = await uploadAssetAction(formData)
    if (!result.success) {
      setError(result.error.message)
      return null
    }
    setAssetUrl(result.data.id, result.data.url)
    return result.data.id
  }

  /**
   * Die Reihe der eigenen Bilder setzen. Das erste ist zugleich das „eine" Stempelbild.
   *
   * Ohne Bild geht es zurück zum Standard-Symbol: ein „eigenes Bild" ohne Bild lässt sich
   * nicht speichern, und die Stempel blieben leer.
   */
  const setCustomImages = (ids: string[]) => {
    setNotice(null)
    if (ids.length === 0) {
      const fallback = DEFAULT_CARD_DESIGN.stampIcon
      patch({ stampIcon: fallback, stampIconAssetId: null, stampIconAssetIds: [] })
      const label = STAMP_ICONS.find((icon) => icon.key === fallback)?.label ?? fallback
      setNotice(
        `Eigene Bilder entfernt. Die Stempel zeigen jetzt das Symbol „${label}" — unter „Bibliothek" oder „Emoji" kannst du ein anderes wählen.`,
      )
      return
    }
    patch({ stampIcon: CUSTOM_ICON_KEY, stampIconAssetId: ids[0]!, stampIconAssetIds: ids })
  }

  const addImages = async (files: File[]) => {
    setError(null)
    const room = STAMP_GOAL_MAX - customImages.length
    if (files.length > room) {
      setError(`Höchstens ${STAMP_GOAL_MAX} Stempelbilder — so viele Stempel hat eine Karte höchstens.`)
      files = files.slice(0, Math.max(0, room))
    }
    const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES)
    if (tooBig) {
      setError(`„${tooBig.name}" ist größer als 5 MB.`)
      return
    }
    if (files.length === 0) return

    setBusy(true)
    const added: string[] = []
    try {
      // Nacheinander, damit die Reihenfolge der Auswahl die Reihenfolge der Stempel ist.
      for (const file of files) {
        const id = await upload(file)
        if (!id) break
        added.push(id)
      }
    } catch {
      setError('Upload fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      // Frisch aus dem Store: während des Hochladens kann sich der Entwurf geändert haben.
      if (added.length > 0) setCustomImages([...customStampImageIds(store.getState().design), ...added])
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const moveImage = (index: number, by: -1 | 1) => {
    const next = [...customImages]
    const target = index + by
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setCustomImages(next)
  }

  const removeImage = (index: number) => setCustomImages(customImages.filter((_, i) => i !== index))

  const pickEmoji = async (emoji: string) => {
    const blob = await renderEmojiToPng(emoji)
    if (!blob) {
      setError('Dieses Emoji konnte nicht gerendert werden.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const id = await upload(new File([blob], 'emoji.png', { type: 'image/png' }))
      if (id) patch({ stampIcon: emojiKey(emoji), stampIconAssetId: id, stampIconAssetIds: [] })
    } catch {
      setError('Upload fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  const initialTab =
    stampIcon === CUSTOM_ICON_KEY ? 'upload' : stampIcon.startsWith('emoji:') ? 'emoji' : 'library'

  return (
    <div className="space-y-2">
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="library">Bibliothek</TabsTrigger>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="upload">Eigenes Bild</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="pt-3">
          <div role="radiogroup" aria-label="Stempel-Symbol" className="grid grid-cols-7 gap-1.5">
            {STAMP_ICONS.map((icon) => {
              const selected = stampIcon === icon.key
              return (
                <button
                  key={icon.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={icon.label}
                  title={icon.label}
                  data-slot="control"
                  onClick={() => {
                    setNotice(null)
                    patch({ stampIcon: icon.key, stampIconAssetId: null, stampIconAssetIds: [] })
                  }}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md border transition-colors',
                    selected
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                  )}
                >
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                    <path d={icon.path} fill="currentColor" fillRule={icon.fillRule} />
                  </svg>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="emoji" className="space-y-3 pt-3">
          <div className="grid grid-cols-10 gap-1">
            {EMOJI_SUGGESTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                data-slot="control"
                disabled={busy}
                aria-label={`Emoji ${emoji}`}
                onClick={() => void pickEmoji(emoji)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-md border text-lg transition-colors',
                  stampIcon === emojiKey(emoji)
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-emoji">Anderes Emoji</Label>
            <div className="flex gap-2">
              <Input
                id="custom-emoji"
                value={customEmoji}
                maxLength={8}
                placeholder="z. B. 🥨"
                onChange={(e) => setCustomEmoji(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={busy || customEmoji.trim().length === 0}
                onClick={() => void pickEmoji(customEmoji.trim())}
              >
                {busy ? <Spinner /> : null}
                Übernehmen
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="space-y-3 pt-3">
          {customImages.length > 0 ? (
            <ol aria-label="Eigene Stempelbilder" className="grid grid-cols-4 gap-2">
              {customImages.map((id, i) => {
                const url = assetUrls[id] ?? null
                return (
                  <li
                    key={`${id}-${i}`}
                    className="group relative flex flex-col items-center gap-1 rounded-md border border-line bg-surface p-1.5"
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="whitespace-nowrap text-[10.5px] font-medium tabular-nums text-ink-3">Bild {i + 1}</span>
                      <IconButton
                        label={`Bild ${i + 1} entfernen`}
                        disabled={busy}
                        tone="danger"
                        onClick={() => removeImage(i)}
                      >
                        <X className="size-3.5" />
                      </IconButton>
                    </div>
                    <div className="flex size-12 items-center justify-center overflow-hidden rounded">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={`Stempelbild ${i + 1}`} className="size-full object-contain" />
                      ) : (
                        <Upload className="size-4 text-ink-3" />
                      )}
                    </div>
                    {customImages.length > 1 ? (
                      <div className="flex items-center gap-0.5">
                        <IconButton
                          label={`Bild ${i + 1} nach vorne`}
                          disabled={busy || i === 0}
                          onClick={() => moveImage(i, -1)}
                        >
                          <ArrowLeft className="size-3.5" />
                        </IconButton>
                        <IconButton
                          label={`Bild ${i + 1} nach hinten`}
                          disabled={busy || i === customImages.length - 1}
                          onClick={() => moveImage(i, 1)}
                        >
                          <ArrowRight className="size-3.5" />
                        </IconButton>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          ) : null}

          {customImages.length > 1 ? (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setCustomImages([])}>
                <Trash2 className="size-3.5" />
                Alle eigenen Bilder entfernen
              </Button>
            </div>
          ) : null}

          {notice && customImages.length === 0 ? (
            <p role="status" className="rounded-md bg-surface-2 px-3 py-2 text-[12px] leading-snug text-ink-2">
              {notice}
            </p>
          ) : null}

          <div className="flex items-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 p-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
              {customImages.length > 0 ? <Plus className="size-4 text-ink-3" /> : <Upload className="size-4 text-ink-3" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">
                {customImages.length > 0 ? 'Weiteres Stempelbild' : 'Eigenes Stempelbild'}
              </p>
              <p className="text-[11.5px] leading-snug text-ink-3">
                PNG, JPG oder SVG · quadratisch · auch mehrere auf einmal
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || customImages.length >= STAMP_GOAL_MAX}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Spinner /> : null}
              {customImages.length > 0 ? 'Hinzufügen' : 'Hochladen'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/svg+xml"
              className="sr-only"
              aria-label="Stempelbilder hochladen"
              onChange={(e) => void addImages(Array.from(e.target.files ?? []))}
            />
          </div>

          <p className="text-[12px] leading-snug text-ink-3">
            {stampSequenceHint(customImages.length, stampGoal)}
          </p>
        </TabsContent>
      </Tabs>

      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function emojiKey(emoji: string): string {
  const points = [...emoji].map((c) => c.codePointAt(0)?.toString(16) ?? '').filter(Boolean)
  return `emoji:${points.join('-')}`
}

/** Draws the glyph with the fonts the user's own device has. */
async function renderEmojiToPng(emoji: string): Promise<Blob | null> {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, size, size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.round(size * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04)

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

function IconButton({
  label,
  disabled,
  tone = 'neutral',
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  tone?: 'neutral' | 'danger'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-6 items-center justify-center rounded text-ink-3 transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30',
        tone === 'danger' ? 'hover:text-danger' : 'hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
