import { useRef, useState } from 'react'
import { FileSpreadsheet, Film, ImageIcon, Keyboard, ShieldCheck, Upload } from 'lucide-react'
import { csvToDrafts, guessMapping, looksLikeHeader, parseCSV, type CsvMapping } from '../../lib/csv'
import { loadImage, prepareCanvas, recognize, UnsupportedImageError } from '../../lib/ocr'
import { markLikelyDuplicates, parseLines, type BalanceCandidate, type DraftTxn } from '../../lib/parse'
import { extractFromVideo, MAX_SECONDS, VideoUnsupportedError } from '../../lib/video'
import { Field, Notice } from '../../components/ui'

export type ImportMode = 'screenshot' | 'recording' | 'csv'

export interface ImportResult {
  rows: DraftTxn[]
  balances: BalanceCandidate[]
  notes: string[]
  warnings: string[]
}

const ACCEPT: Record<ImportMode, string> = {
  screenshot: 'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif,.png,.jpg,.jpeg',
  recording: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm',
  csv: '.csv,text/csv',
}

const OCR_STATUS: Record<string, string> = {
  'loading tesseract core': 'Loading the on-device reader',
  'initializing tesseract': 'Starting the on-device reader',
  'loading language traineddata': 'Loading the English text model',
  'initializing api': 'Getting ready',
  'recognizing text': 'Reading text',
}

export function PrivacyBeforeUpload({ mode }: { mode: ImportMode }) {
  const what =
    mode === 'csv'
      ? 'the date, description, and amount columns in your file'
      : 'visible merchant names, dates, amounts, and balances'
  return (
    <Notice icon={<ShieldCheck size={20} strokeWidth={2} aria-hidden />}>
      <strong>What Finfriend reads:</strong> {what}.
      <ul>
        <li>{mode === 'csv' ? 'Delete any columns with account or card numbers before you upload.' : 'Crop out or cover your name, account numbers, and card numbers before you upload.'}</li>
        <li>Reading happens on this device. The file is not sent anywhere.</li>
        <li>{mode === 'csv' ? 'The file is' : mode === 'recording' ? 'The video is' : 'Your screenshots are'} discarded after reading. You review every result before anything is saved.</li>
      </ul>
    </Notice>
  )
}

export function Importer({ mode, today, onDone, onSwitch }: { mode: ImportMode; today: string; onDone: (r: ImportResult) => void; onSwitch: (to: ImportMode | 'manual') => void }) {
  const input = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const [phase, setPhase] = useState<'pick' | 'working' | 'csvmap' | 'error'>('pick')
  const [status, setStatus] = useState('')
  const [pct, setPct] = useState<number | null>(null)
  const [error, setError] = useState<{ title: string; body: string } | null>(null)
  const [drag, setDrag] = useState(false)
  const [csv, setCsv] = useState<{ header: string[]; body: string[][]; mapping: CsvMapping; name: string } | null>(null)

  const fail = (title: string, body: string) => {
    setError({ title, body })
    setPhase('error')
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    cancelled.current = false
    setError(null)
    if (mode === 'csv') return handleCsv(files[0])
    setPhase('working')
    try {
      if (mode === 'screenshot') await handleImages(files)
      else await handleVideo(files[0])
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setPhase('pick')
        return
      }
      if (e instanceof UnsupportedImageError) fail("Finfriend couldn't open that image", `${e.message} Try a PNG or JPG screenshot instead.`)
      else if (e instanceof VideoUnsupportedError)
        fail(
          "This browser can't read that video",
          `${e.message} iPhone recordings saved as HEVC may not open outside Safari. Try the recording in Safari or Chrome, use screenshots, or import a CSV.`,
        )
      else fail('Something went wrong while reading', 'Nothing was saved. Try again, or add your information another way.')
      console.error(e)
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function handleImages(files: File[]) {
    const rows: DraftTxn[] = []
    const balances: BalanceCandidate[] = []
    let minus = 0
    let plus = 0
    for (let i = 0; i < files.length; i++) {
      if (cancelled.current) throw new DOMException('Cancelled', 'AbortError')
      const label = files.length > 1 ? `Screenshot ${i + 1}` : 'Your screenshot'
      setStatus(files.length > 1 ? `Reading screenshot ${i + 1} of ${files.length}` : 'Reading your screenshot')
      setPct(null)
      const bmp = await loadImage(files[i])
      const canvas = prepareCanvas(bmp, bmp.width, bmp.height)
      bmp.close()
      const lines = await recognize(canvas, (m) => {
        setStatus(OCR_STATUS[m.status] ?? 'Reading text')
        setPct(m.status === 'recognizing text' ? m.progress : null)
      })
      canvas.width = canvas.height = 0
      const parsed = parseLines(lines, today, label)
      parsed.rows.forEach((r) => (r.source = 'screenshot'))
      rows.push(...parsed.rows)
      for (const b of parsed.balances) if (!balances.some((x) => x.amount === b.amount)) balances.push(b)
      minus += parsed.signsSeen.minus
      plus += parsed.signsSeen.plus
    }
    markLikelyDuplicates(rows)
    if (rows.length === 0 && balances.length === 0) {
      fail(
        "Finfriend couldn't find a balance or transactions",
        'Try a sharper screenshot that shows amounts with a $ sign, or enter your information by hand.',
      )
      return
    }
    const notes: string[] = []
    const warnings: string[] = []
    if (rows.length === 0) notes.push("Finfriend found a balance but no transactions. That's enough to start. Spending pace appears once you add purchases.")
    if (rows.length > 0 && minus === 0 && plus === 0)
      warnings.push('No + or − signs were visible, so rows are marked as spending unless the name suggests income. Check any money you received.')
    onDone({ rows, balances, notes, warnings })
  }

  async function handleVideo(file: File) {
    setStatus('Opening your recording')
    const r = await extractFromVideo(
      file,
      today,
      (p) => {
        if (p.phase === 'loading') {
          setStatus('Opening your recording')
          setPct(null)
        } else if (p.phase === 'sampling') {
          setStatus('Picking frames to read')
          setPct(p.done / p.total)
        } else {
          setStatus(p.done < p.total ? `Reading frame ${p.done + 1} of ${p.total}` : 'Combining frames')
          setPct(p.total ? p.done / p.total : null)
        }
      },
      () => cancelled.current,
    )
    r.rows.forEach((row) => (row.source = 'recording'))
    if (r.rows.length === 0 && r.balances.length === 0) {
      fail(
        "Finfriend couldn't find transactions in this recording",
        'Try scrolling more slowly, or use screenshots instead.',
      )
      return
    }
    const notes = [`Finfriend read ${r.framesRead} frames from your ${Math.round(Math.min(r.duration, MAX_SECONDS))} second recording and removed rows repeated between frames.`]
    const warnings: string[] = []
    if (r.duration > MAX_SECONDS) warnings.push(`Only the first ${MAX_SECONDS / 60} minutes were read. Add a second recording or screenshots for older transactions.`)
    if (r.gaps.length > 0)
      warnings.push(
        `Some rows may be missing near ${r.gaps.slice(0, 3).join(', ')}. The screen moved faster than Finfriend could read. Add a screenshot of that part, or add rows by hand.`,
      )
    if (r.rows.length > 0 && r.signsSeen.minus === 0 && r.signsSeen.plus === 0)
      warnings.push('No + or − signs were visible, so rows are marked as spending unless the name suggests income. Check any money you received.')
    onDone({ rows: r.rows, balances: r.balances, notes, warnings })
  }

  async function handleCsv(file: File) {
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) return fail('That file looks empty', 'Choose a CSV export from your bank, or add transactions by hand.')
    const hasHeader = looksLikeHeader(rows[0])
    const header = hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`)
    const body = hasHeader ? rows.slice(1) : rows
    setCsv({ header, body, mapping: guessMapping(header, body), name: file.name })
    setPhase('csvmap')
  }

  function finishCsv() {
    if (!csv) return
    const { drafts, skipped } = csvToDrafts(csv.body, csv.mapping, today)
    drafts.forEach((d) => (d.source = 'csv'))
    if (drafts.length === 0) return fail('No transactions found with those columns', 'Check the column choices and try again.')
    const notes = [`Read ${drafts.length} rows from ${csv.name}.`]
    if (skipped > 0) notes.push(`${skipped} ${skipped === 1 ? 'row had' : 'rows had'} no readable amount and ${skipped === 1 ? 'was' : 'were'} skipped.`)
    onDone({ rows: drafts, balances: [], notes, warnings: [] })
  }

  const Icon = mode === 'screenshot' ? ImageIcon : mode === 'recording' ? Film : FileSpreadsheet

  if (phase === 'working') {
    return (
      <div className="card stack center" aria-live="polite" style={{ alignItems: 'center' }}>
        <div className="spinner" aria-hidden />
        <h3>{status}</h3>
        {pct !== null && (
          <div className="progress-bar" style={{ width: '100%' }} aria-hidden>
            <div style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
        )}
        <p className="caption">This runs on your device. A recording can take a minute or two.</p>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            cancelled.current = true
            setStatus('Stopping')
          }}
        >
          Stop reading
        </button>
      </div>
    )
  }

  if (phase === 'csvmap' && csv) {
    const col = (key: 'date' | 'description' | 'amount' | 'debit' | 'credit', label: string) => (
      <Field label={label} htmlFor={`map-${key}`}>
        <select
          id={`map-${key}`}
          className="input"
          value={csv.mapping[key]}
          onChange={(e) => setCsv({ ...csv, mapping: { ...csv.mapping, [key]: Number(e.target.value) } })}
        >
          {(key === 'debit' || key === 'credit' || key === 'amount') && <option value={-1}>Not used</option>}
          {csv.header.map((h, i) => (
            <option key={i} value={i}>
              {h || `Column ${i + 1}`}
            </option>
          ))}
        </select>
      </Field>
    )
    const sample = csv.body.slice(0, 3)
    return (
      <div className="stack">
        <div className="card stack">
          <h3>Match your columns</h3>
          <p className="caption">Finfriend guessed these from {csv.name}. Change any that look wrong.</p>
          {col('date', 'Date')}
          {col('description', 'Description')}
          {col('amount', 'Amount')}
          {csv.mapping.amount < 0 && (
            <div className="grid-2">
              {col('debit', 'Money out')}
              {col('credit', 'Money in')}
            </div>
          )}
          {csv.mapping.amount >= 0 && (
            <Field label="In this file, a positive amount means">
              <div className="toggle2" role="group">
                <button type="button" aria-pressed={csv.mapping.positiveMeans === 'income'} onClick={() => setCsv({ ...csv, mapping: { ...csv.mapping, positiveMeans: 'income' } })}>
                  Money in
                </button>
                <button type="button" aria-pressed={csv.mapping.positiveMeans === 'expense'} onClick={() => setCsv({ ...csv, mapping: { ...csv.mapping, positiveMeans: 'expense' } })}>
                  Money out
                </button>
              </div>
            </Field>
          )}
          <div className="stack-sm">
            <span className="eyebrow">First rows</span>
            {sample.map((r, i) => (
              <div key={i} className="caption" style={{ wordBreak: 'break-word' }}>
                {r[csv.mapping.date]} · {r[csv.mapping.description]} · {csv.mapping.amount >= 0 ? r[csv.mapping.amount] : `${r[csv.mapping.debit] || ''} ${r[csv.mapping.credit] || ''}`}
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="btn primary block" onClick={finishCsv}>
          Read {csv.body.length} rows
        </button>
        <button type="button" className="btn ghost" onClick={() => setPhase('pick')}>
          Choose a different file
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      {phase === 'error' && error && (
        <Notice tone="alert">
          <strong>{error.title}</strong>
          <p>{error.body}</p>
        </Notice>
      )}
      <PrivacyBeforeUpload mode={mode} />
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          handleFiles([...e.dataTransfer.files])
        }}
      >
        <span className="option-icon">
          <Icon size={24} strokeWidth={2} aria-hidden />
        </span>
        <h3>
          {mode === 'screenshot' ? 'Add one or more screenshots' : mode === 'recording' ? 'Add a screen recording' : 'Add a CSV file'}
        </h3>
        <p className="caption">
          {mode === 'screenshot'
            ? 'PNG, JPG, or HEIC. Select several at once, and you can add more after.'
            : mode === 'recording'
              ? `MP4 or MOV, up to ${MAX_SECONDS / 60} minutes. Scroll slowly through last month's transactions.`
              : 'Most banks let you export transactions as a CSV from their website.'}
        </p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT[mode]}
          multiple={mode === 'screenshot'}
          className="sr-only"
          id={`file-${mode}`}
          data-testid={`file-${mode}`}
          onChange={(e) => handleFiles([...(e.target.files ?? [])])}
        />
        <label htmlFor={`file-${mode}`} className="btn primary">
          <Upload size={18} strokeWidth={2} aria-hidden /> Choose {mode === 'screenshot' ? 'screenshot(s)' : 'a file'}
        </label>
      </div>
      <div className="stack-sm">
        <span className="caption">Prefer another way?</span>
        <div className="chips">
          {(
            [
              ['screenshot', 'Use screenshot(s)', ImageIcon],
              ['recording', 'Use a screen recording', Film],
              ['csv', 'Import a CSV', FileSpreadsheet],
            ] as const
          )
            .filter(([m]) => m !== mode)
            .map(([m, label, I]) => (
              <button key={m} type="button" className="chip" onClick={() => onSwitch(m)}>
                <I size={16} strokeWidth={2} aria-hidden /> {label}
              </button>
            ))}
          <button type="button" className="chip" onClick={() => onSwitch('manual')}>
            <Keyboard size={16} strokeWidth={2} aria-hidden /> Type it in
          </button>
        </div>
      </div>
    </div>
  )
}
