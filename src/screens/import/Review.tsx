import { useState } from 'react'
import { AlertCircle, Check, Plus, Trash2 } from 'lucide-react'
import { suggestCategory } from '../../lib/categories'
import { fmtShort } from '../../lib/dates'
import { money } from '../../lib/money'
import { FLAG_TEXT, type BalanceCandidate, type DraftTxn } from '../../lib/parse'
import { CategorySelect, DateInput, Field, KindToggle, MoneyInput, Notice } from '../../components/ui'

export function emptyDraft(today: string): DraftTxn {
  return {
    id: `m${Math.random().toString(36).slice(2, 9)}`,
    description: '',
    date: today,
    amount: null,
    kind: 'expense',
    category: 'other',
    categorySure: false,
    flags: [],
    include: true,
    pending: false,
    conf: 100,
    origin: 'Added by you',
    dateExplicit: true,
    source: 'manual',
  }
}

export function rowProblems(r: DraftTxn, today: string): string[] {
  const out: string[] = []
  if (!r.description.trim()) out.push('Add a name')
  if (r.amount === null || r.amount <= 0) out.push('Add an amount')
  if (!r.date) out.push('Add a date')
  else if (r.date > today) out.push('Use a date that isn’t in the future')
  return out
}

export function invalidIncluded(rows: DraftTxn[], today: string) {
  return rows.filter((r) => r.include && rowProblems(r, today).length > 0)
}

function RowEditor({ row, onChange, onDelete, today, showErrors }: { row: DraftTxn; onChange: (r: DraftTxn) => void; onDelete: () => void; today: string; showErrors: boolean }) {
  const set = (patch: Partial<DraftTxn>) => onChange({ ...row, ...patch })
  const problems = rowProblems(row, today)
  const flagged = row.flags.length > 0
  const label = row.description || 'this row'
  return (
    <div className={`editor-row ${flagged ? 'flagged' : ''} ${row.include ? '' : 'excluded'}`}>
      <div className="between">
        <label className="check">
          <input type="checkbox" checked={row.include} onChange={(e) => set({ include: e.target.checked })} aria-label={`Include ${label}`} />
          <span>{row.include ? 'Included' : 'Not included'}</span>
        </label>
        <div className="row" style={{ gap: 6 }}>
          <span className="tag">{row.origin}</span>
          <button type="button" className="icon-btn" style={{ width: 40, height: 40 }} onClick={onDelete} aria-label={`Delete ${label}`}>
            <Trash2 size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
      {flagged && (
        <div className="stack-sm">
          {row.flags.map((f) => (
            <span key={f} className="flag">
              <AlertCircle size={16} strokeWidth={2} aria-hidden /> {FLAG_TEXT[f]}
            </span>
          ))}
        </div>
      )}
      {row.pending && <span className="caption">Marked pending at your bank. It may already be in your available balance.</span>}
      <input
        className="input compact"
        value={row.description}
        placeholder="Merchant or description"
        aria-label="Merchant or description"
        onChange={(e) => {
          const description = e.target.value
          const patch: Partial<DraftTxn> = { description }
          if (!row.categorySure) {
            const s = suggestCategory(description, row.kind)
            if (s.sure) patch.category = s.id
          }
          set(patch)
        }}
      />
      <div className="grid-2">
        <MoneyInput compact value={row.amount} onChange={(amount) => set({ amount })} ariaLabel="Amount" invalid={showErrors && row.include && (row.amount === null || row.amount <= 0)} />
        <DateInput compact value={row.date} onChange={(date) => set({ date, dateExplicit: true })} ariaLabel="Date" max={today} />
      </div>
      {row.alternates && row.alternates.length > 1 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <span className="caption">Read as:</span>
          {row.alternates.map((a) => (
            <button key={a} type="button" className="chip" aria-pressed={row.amount === a} onClick={() => set({ amount: a })}>
              {money(a)}
            </button>
          ))}
        </div>
      )}
      <KindToggle
        value={row.kind}
        onChange={(kind) => {
          const s = suggestCategory(row.description, kind)
          set({ kind, category: s.id, categorySure: s.sure })
        }}
      />
      <CategorySelect kind={row.kind} value={row.category} onChange={(category) => set({ category, categorySure: true })} compact />
      {!row.categorySure && <span className="caption">Category is a guess. Change it if it’s wrong.</span>}
      {showErrors && row.include && problems.length > 0 && (
        <span className="error-text">
          <AlertCircle size={16} strokeWidth={2} aria-hidden /> {problems.join('. ')}.
        </span>
      )}
      {flagged && (
        <button
          type="button"
          className="btn soft sm"
          disabled={problems.length > 0}
          onClick={() => set({ flags: [], include: true })}
          title={problems.length > 0 ? problems.join('. ') : undefined}
        >
          <Check size={16} strokeWidth={2} aria-hidden /> {problems.length > 0 ? problems[0] + ' first' : 'Looks right, include it'}
        </button>
      )}
    </div>
  )
}

export function BalanceReview({
  balances,
  balance,
  setBalance,
  asOf,
  setAsOf,
  today,
  title = 'Current available balance',
  sub = 'Use the amount you can spend now. An approximate number is fine.',
  dateLabel = 'This balance is from',
}: {
  title?: string
  sub?: string
  dateLabel?: string
  balances: BalanceCandidate[]
  balance: number | null
  setBalance: (v: number | null) => void
  asOf: string
  setAsOf: (v: string) => void
  today: string
}) {
  return (
    <div className="card stack">
      <div className="stack-sm">
        <h3>{title}</h3>
        <p className="caption">{sub}</p>
      </div>
      {balances.length > 0 && (
        <div className="stack-sm">
          <span className="label">Found on your {balances[0].origin.startsWith('Screenshot') || balances[0].origin === 'Your screenshot' ? 'screenshot' : 'recording'}. Tap one if it matches your bank app:</span>
          <div className="chips">
            {balances.map((b) => (
              <button key={b.amount + b.label} type="button" className="chip" aria-pressed={balance === b.amount} onClick={() => setBalance(b.amount)}>
                {b.label}: {money(b.amount)}
                {b.conf < 70 ? ' (hard to read)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      <Field label="Balance" htmlFor="balance">
        <MoneyInput id="balance" value={balance} onChange={setBalance} />
      </Field>
      <Field label={dateLabel} htmlFor="asof" hint={asOf === today ? 'Today' : `Purchases after ${fmtShort(asOf)} will lower it.`}>
        <DateInput id="asof" value={asOf} onChange={(v) => setAsOf(v ?? today)} max={today} />
      </Field>
    </div>
  )
}

export function RowsReview({ rows, setRows, today, showErrors, notes, warnings }: { rows: DraftTxn[]; setRows: (r: DraftTxn[]) => void; today: string; showErrors: boolean; notes: string[]; warnings: string[] }) {
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const flaggedCount = rows.filter((r) => r.flags.length > 0).length
  const shown = onlyFlagged ? rows.filter((r) => r.flags.length > 0) : rows
  const included = rows.filter((r) => r.include).length
  return (
    <div className="stack">
      {notes.map((n) => (
        <Notice key={n}>{n}</Notice>
      ))}
      {warnings.map((w) => (
        <Notice key={w} tone="alert">
          {w}
        </Notice>
      ))}
      {rows.length > 0 && (
        <div className="between">
          <div>
            <h3>Transactions</h3>
            <p className="caption">
              {included} of {rows.length} included. Unchecked rows won’t be saved.
            </p>
          </div>
          {flaggedCount > 0 && (
            <button type="button" className="chip" aria-pressed={onlyFlagged} onClick={() => setOnlyFlagged(!onlyFlagged)}>
              To check ({flaggedCount})
            </button>
          )}
        </div>
      )}
      <div className="list-editor">
        {shown.map((r) => (
          <RowEditor
            key={r.id}
            row={r}
            today={today}
            showErrors={showErrors}
            onChange={(n) => setRows(rows.map((x) => (x.id === r.id ? n : x)))}
            onDelete={() => setRows(rows.filter((x) => x.id !== r.id))}
          />
        ))}
      </div>
      <button type="button" className="btn secondary" onClick={() => setRows([...rows, emptyDraft(today)])}>
        <Plus size={18} strokeWidth={2} aria-hidden /> Add a transaction
      </button>
    </div>
  )
}
