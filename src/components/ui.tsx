import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, ChevronLeft, Info } from 'lucide-react'
import { categoriesFor } from '../lib/categories'
import { HIDDEN, money, parseMoneyInput, signedMoney } from '../lib/money'
import type { Kind } from '../lib/types'
import { useStore } from '../state/store'

/** Shows an amount, or dots when the user has hidden amounts. */
export function Amount({ value, signed, className }: { value: number; signed?: Kind; className?: string }) {
  const { hidden } = useStore()
  const text = hidden ? HIDDEN : signed ? signedMoney(value, signed) : money(value)
  return (
    <span className={`num ${className ?? ''}`} aria-label={hidden ? 'Amount hidden' : undefined}>
      {text}
    </span>
  )
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && (
        <span className="error-text" role="alert">
          <AlertCircle size={16} strokeWidth={2} aria-hidden /> {error}
        </span>
      )}
    </div>
  )
}

const fmtInput = (v: number | null) => (v === null ? '' : Number.isInteger(v) ? String(v) : v.toFixed(2))

/** Money input that keeps the user's text while typing and reports a parsed value. */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = '0.00',
  compact,
  ariaLabel,
  autoFocus,
  invalid,
}: {
  value: number | null
  onChange: (v: number | null) => void
  id?: string
  placeholder?: string
  compact?: boolean
  ariaLabel?: string
  autoFocus?: boolean
  invalid?: boolean
}) {
  const [text, setText] = useState(fmtInput(value))
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      setText(fmtInput(value))
      last.current = value
    }
  }, [value])
  const bad = text.trim() !== '' && parseMoneyInput(text) === null
  return (
    <div className={`input-money ${compact ? 'compact' : ''}`}>
      <span aria-hidden>$</span>
      <input
        id={id}
        className={`input num ${compact ? 'compact' : ''} ${bad || invalid ? 'invalid' : ''}`}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        aria-label={ariaLabel}
        aria-invalid={bad || invalid}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseMoneyInput(e.target.value)
          last.current = v
          onChange(v)
        }}
      />
    </div>
  )
}

export function DateInput({ value, onChange, id, compact, ariaLabel, min, max }: { value: string | null; onChange: (v: string | null) => void; id?: string; compact?: boolean; ariaLabel?: string; min?: string; max?: string }) {
  return (
    <input
      id={id}
      type="date"
      className={`input ${compact ? 'compact' : ''}`}
      value={value ?? ''}
      aria-label={ariaLabel}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value || null)}
    />
  )
}

export function CategorySelect({ kind, value, onChange, compact, id }: { kind: Kind; value: string; onChange: (v: string) => void; compact?: boolean; id?: string }) {
  return (
    <select id={id} className={`input ${compact ? 'compact' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Category">
      {categoriesFor(kind).map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  )
}

export function KindToggle({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <div className="toggle2" role="group" aria-label="Spending or income">
      <button type="button" aria-pressed={value === 'expense'} onClick={() => onChange('expense')}>
        Spending
      </button>
      <button type="button" aria-pressed={value === 'income'} onClick={() => onChange('income')}>
        Income
      </button>
    </div>
  )
}

export function Option({ checked, onClick, title, desc, icon }: { checked: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode; icon?: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="option" onClick={onClick} aria-label={typeof title === 'string' ? title : undefined}>
      {icon ? <span className="option-icon">{icon}</span> : <span className="dot" aria-hidden />}
      <span className="grow">
        <span className="title" style={{ display: 'block' }}>
          {title}
        </span>
        {desc && <span className="desc">{desc}</span>}
      </span>
      {icon && <span className="dot" aria-hidden />}
    </button>
  )
}

export function Notice({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'alert'; icon?: ReactNode }) {
  return (
    <div className={`notice ${tone === 'alert' ? 'alert' : ''}`} role={tone === 'alert' ? 'alert' : undefined}>
      {icon ?? (tone === 'alert' ? <AlertCircle size={20} strokeWidth={2} aria-hidden /> : <Info size={20} strokeWidth={2} aria-hidden />)}
      <div className="grow">{children}</div>
    </div>
  )
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="back" onClick={onClick}>
      <ChevronLeft size={20} strokeWidth={2} aria-hidden /> {label}
    </button>
  )
}

export function Sheet({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelledBy?: string }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? id} ref={ref} tabIndex={-1}>
        <div className="sheet-grip" aria-hidden />
        <div className="between">
          <h2 id={id}>{title}</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress" aria-label={`Step ${step} of ${total}`}>
      <span className="eyebrow">
        Step {step} of {total}
      </span>
      <div className="progress-bar" aria-hidden>
        <div style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  )
}
