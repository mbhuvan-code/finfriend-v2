import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Eye, EyeOff, Trash2, XCircle } from 'lucide-react'
import { checkPurchase } from '../../lib/calc'
import { categoryLabel, suggestCategory } from '../../lib/categories'
import { fmtDay, fmtShort } from '../../lib/dates'
import { HIDDEN } from '../../lib/money'
import type { BalanceCandidate, DraftTxn } from '../../lib/parse'
import { similarity } from '../../lib/merge'
import { money } from '../../lib/money'
import { uid, type Txn } from '../../lib/types'
import { useFinance, useStore } from '../../state/store'
import { Amount, CategorySelect, DateInput, Field, KindToggle, MoneyInput, Notice, Option, Sheet } from '../../components/ui'
import { Importer, type ImportMode } from '../import/Importer'
import { invalidIncluded, RowsReview } from '../import/Review'
import { draftToTxn } from '../onboarding/DataStep'
import { IncomeFields } from '../onboarding/Onboarding'
import { CardFields, cardComplete } from '../onboarding/CardFields'
import { usesCard, type CardInfo } from '../../lib/types'
import { Breakdown } from './Breakdown'

const maskMoney = (s: string, hidden: boolean) => (hidden ? s.replace(/[−-]?\$[\d,]+\.\d{2}/g, HIDDEN) : s)

// ------------------------------------------------------------------ purchase checker

export function CheckSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { update, today, hidden, setHidden } = useStore()
  const { plan, week } = useFinance()
  const [what, setWhat] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const close = () => {
    setWhat('')
    setPrice(null)
    setSaved(null)
    onClose()
  }
  const result = price !== null && price > 0 ? checkPurchase(plan, week, price) : null
  const tone = !result ? '' : result.verdict === 'fitsToday' ? 'good' : result.verdict === 'fitsLater' ? 'warn' : 'bad'
  const Icon = !result
    ? null
    : result.verdict === 'fitsToday'
      ? CheckCircle2
      : result.verdict === 'fitsLater'
        ? Clock
        : result.verdict === 'overBalance'
          ? XCircle
          : AlertTriangle

  function record() {
    if (!price) return
    const desc = what.trim() || 'Purchase'
    const t: Txn = {
      id: uid(),
      description: desc,
      date: today,
      amount: price,
      kind: 'expense',
      category: suggestCategory(desc, 'expense').id,
      source: 'checker',
      inBalance: false,
    }
    update((s) => ({ ...s, txns: [t, ...s.txns] }))
    setSaved(desc)
    setPrice(null)
    setWhat('')
  }

  return (
    <Sheet open={open} onClose={close} title="Can I afford it?">
      <Field label="What are you thinking of buying?" htmlFor="chk-what">
        <input id="chk-what" className="input" value={what} placeholder="Concert tickets" onChange={(e) => { setWhat(e.target.value); setSaved(null) }} />
      </Field>
      <Field label="How much does it cost?" htmlFor="chk-price">
        <MoneyInput id="chk-price" value={price} onChange={(v) => { setPrice(v); setSaved(null) }} autoFocus />
      </Field>
      {saved && (
        <Notice icon={<CheckCircle2 size={20} strokeWidth={2} aria-hidden />}>
          Added “{saved}” to your records for today. Your dashboard now includes it.
        </Notice>
      )}
      {result && Icon && (
        <div className={`verdict ${tone}`} aria-live="polite">
          <div className="head">
            <Icon size={22} strokeWidth={2} aria-hidden />
            {result.title}
          </div>
          <ul>
            {result.lines.map((l) => (
              <li key={l}>{maskMoney(l, hidden)}</li>
            ))}
          </ul>
          {hidden && (
            <button type="button" className="link" onClick={() => setHidden(false)}>
              <Eye size={14} strokeWidth={2} aria-hidden /> Show amounts
            </button>
          )}
        </div>
      )}
      {!result && !saved && plan.ok && (
        <p className="caption">
          Today you have <Amount value={Math.max(0, plan.leftToday)} /> to spend. Enter a price to see how it fits.
        </p>
      )}
      <p className="caption">Checking a price doesn’t change your records.</p>
      {result && result.verdict !== 'unknown' && (
        <button type="button" className="btn secondary block" onClick={record}>
          I bought it, add to my records
        </button>
      )}
      <button type="button" className="btn primary block" onClick={close}>
        Done
      </button>
    </Sheet>
  )
}

// ------------------------------------------------------------------ transaction view / edit / add

export function TxnSheet({ open, txnId, onClose }: { open: boolean; txnId: string | null; onClose: () => void }) {
  const { state, update, today } = useStore()
  const existing = txnId ? state.txns.find((t) => t.id === txnId) ?? null : null
  const isNew = !existing
  const [editing, setEditing] = useState(isNew)
  const [draft, setDraft] = useState<Txn>(
    () =>
      existing ?? { id: uid(), description: '', date: today, amount: 0, kind: 'expense', category: 'other', source: 'manual', inBalance: false },
  )
  const [amount, setAmount] = useState<number | null>(existing ? existing.amount : null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const asOf = state.balance.asOf
  const problems = [!draft.description.trim() && 'Add a name', (!amount || amount <= 0) && 'Add an amount', !draft.date && 'Add a date', draft.date > today && 'Use a date that isn’t in the future'].filter(Boolean) as string[]

  function save() {
    if (problems.length) {
      setShowErrors(true)
      return
    }
    const t = { ...draft, description: draft.description.trim(), amount: amount! }
    update((s) => ({ ...s, txns: isNew ? [t, ...s.txns] : s.txns.map((x) => (x.id === t.id ? t : x)) }))
    onClose()
  }

  if (!editing && existing) {
    return (
      <Sheet open={open} onClose={onClose} title={existing.description}>
        <div className="card list">
          <div className="summary-row">
            <span className="caption">Amount</span>
            <Amount value={existing.amount} signed={existing.kind} className="label" />
          </div>
          <div className="summary-row">
            <span className="caption">Date</span>
            <span>{fmtDay(existing.date)}</span>
          </div>
          <div className="summary-row">
            <span className="caption">Category</span>
            <span>{categoryLabel(existing.category)}</span>
          </div>
          <div className="summary-row">
            <span className="caption">Type</span>
            <span>{existing.kind === 'expense' ? 'Spending' : 'Income'}</span>
          </div>
          <div className="summary-row">
            <span className="caption">In your balance</span>
            <span>{existing.inBalance ? 'Already included' : 'Recorded after it'}</span>
          </div>
          <div className="summary-row">
            <span className="caption">Added from</span>
            <span>{{ screenshot: 'Screenshot', recording: 'Screen recording', csv: 'CSV file', manual: 'Typed by you', checker: 'Purchase checker', sample: 'Sample data for demos' }[existing.source]}</span>
          </div>
        </div>
        <button type="button" className="btn primary block" onClick={() => setEditing(true)}>
          Edit transaction
        </button>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'Add a transaction' : 'Edit transaction'}>
      <KindToggle value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind, category: suggestCategory(draft.description, kind).id })} />
      <Field label="Merchant or description" htmlFor="tx-desc" error={showErrors && !draft.description.trim() ? 'Add a name' : null}>
        <input
          id="tx-desc"
          className="input"
          value={draft.description}
          placeholder={draft.kind === 'expense' ? 'Trader Joe’s' : 'Paycheck'}
          onChange={(e) => {
            const description = e.target.value
            const sug = suggestCategory(description, draft.kind)
            setDraft({ ...draft, description, category: isNew && sug.sure ? sug.id : draft.category })
          }}
        />
      </Field>
      <div className="grid-2">
        <Field label="Amount" htmlFor="tx-amt" error={showErrors && (!amount || amount <= 0) ? 'Add an amount' : null}>
          <MoneyInput id="tx-amt" value={amount} onChange={setAmount} />
        </Field>
        <Field label="Date" htmlFor="tx-date">
          <DateInput id="tx-date" value={draft.date} onChange={(d) => setDraft({ ...draft, date: d ?? today })} max={today} />
        </Field>
      </div>
      <Field label="Category" htmlFor="tx-cat">
        <CategorySelect id="tx-cat" kind={draft.kind} value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={draft.inBalance} onChange={(e) => setDraft({ ...draft, inBalance: e.target.checked })} />
        Already included in my bank balance
      </label>
      <p className="caption">
        {asOf
          ? `Leave this off for anything after your balance on ${fmtShort(asOf)}. Finfriend then ${draft.kind === 'expense' ? 'subtracts it from' : 'adds it to'} your cash.`
          : 'Add your balance so Finfriend knows which transactions it already includes.'}
      </p>
      {showErrors && problems.length > 0 && <Notice tone="alert">{problems.join('. ')}.</Notice>}
      <button type="button" className="btn primary block" onClick={save}>
        {isNew ? 'Add transaction' : 'Save changes'}
      </button>
      {!isNew &&
        (confirmDelete ? (
          <div className="card stack">
            <p>Delete this transaction? Your totals update right away.</p>
            <div className="grid-2">
              <button type="button" className="btn secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  update((s) => ({ ...s, txns: s.txns.filter((t) => t.id !== draft.id) }))
                  onClose()
                }}
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden /> Delete
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn danger block" onClick={() => setConfirmDelete(true)}>
            Delete transaction
          </button>
        ))}
    </Sheet>
  )
}

// ------------------------------------------------------------------ update balance

export function BalanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, update, today } = useStore()
  const card = usesCard(state)
  // Bank and card are updated together because they share one "as of" date.
  const [cardInfo, setCardInfo] = useState<CardInfo>({ ...state.card, owed: null })
  const [showErrors, setShowErrors] = useState(false)
  const [amount, setAmount] = useState<number | null>(null)
  const [pending, setPending] = useState<'included' | 'notIncluded'>('included')
  const [pendingAmt, setPendingAmt] = useState<number | null>(null)
  function save() {
    if (amount === null || (card && !cardComplete(cardInfo))) return setShowErrors(true)
    update((s) => ({
      ...s,
      balance: { amount, asOf: today, source: 'manual' },
      card: card ? cardInfo : s.card,
      pending: pending === 'included' ? { answer: 'included', amount: null } : { answer: 'notIncluded', amount: pendingAmt ?? 0 },
      // A fresh balance from today already reflects everything dated today or earlier.
      txns: s.txns.map((t) => (t.date <= today ? { ...t, inBalance: true } : t)),
    }))
    setAmount(null)
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={card ? 'Update your balances' : 'Update your balance'}>
      <p className="muted">{card ? 'Check your bank and card apps and enter today’s numbers.' : 'Check your bank app and enter what you have available right now.'}</p>
      {state.balance.amount !== null && (
        <p className="caption">
          Last balance: <Amount value={state.balance.amount} /> on {fmtShort(state.balance.asOf!)}.
        </p>
      )}
      <Field label={card ? 'Bank account balance today' : 'Available balance today'} htmlFor="new-bal" error={showErrors && amount === null ? 'Add your balance.' : null}>
        <MoneyInput id="new-bal" value={amount} onChange={setAmount} autoFocus />
      </Field>
      {card && <CardFields card={cardInfo} onChange={setCardInfo} showErrors={showErrors} />}
      <div className="options" role="radiogroup" aria-label="Pending spending">
        <Option checked={pending === 'included'} onClick={() => setPending('included')} title="It shows all my spending so far" />
        <Option checked={pending === 'notIncluded'} onClick={() => setPending('notIncluded')} title="Some purchases are still pending" />
      </div>
      {pending === 'notIncluded' && (
        <Field label="About how much is pending?" htmlFor="new-pend">
          <MoneyInput id="new-pend" value={pendingAmt} onChange={setPendingAmt} />
        </Field>
      )}
      <p className="caption">Transactions dated today or earlier will count as already in {card ? 'these balances' : 'this balance'}.</p>
      <button type="button" className="btn primary block" onClick={save}>
        {card ? 'Save balances' : 'Save balance'}
      </button>
    </Sheet>
  )
}

// ------------------------------------------------------------------ income

export function IncomeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Your next income">
      {open && <IncomeBody onClose={onClose} />}
    </Sheet>
  )
}
function IncomeBody({ onClose }: { onClose: () => void }) {
  const { valid, ui } = IncomeFields()
  return (
    <>
      <p className="muted">Finfriend plans your spending money until this date.</p>
      {ui}
      <button type="button" className="btn primary block" onClick={onClose} disabled={!valid}>
        Done
      </button>
    </>
  )
}

// ------------------------------------------------------------------ how it's calculated

export function CalcSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { plan } = useFinance()
  return (
    <Sheet open={open} onClose={onClose} title="How this is calculated">
      <p className="muted">Every number comes from what you entered or confirmed.</p>
      <div className="card">
        <Breakdown plan={plan} />
      </div>
      <button type="button" className="btn primary block" onClick={onClose}>
        Got it
      </button>
    </Sheet>
  )
}

// ------------------------------------------------------------------ privacy and data

export function SettingsSheet({ open, onClose, onEdit }: { open: boolean; onClose: () => void; onEdit: (what: 'balance' | 'income' | 'setup') => void }) {
  const { state, update, clearAll, hidden, setHidden } = useStore()
  const [confirm, setConfirm] = useState(false)
  return (
    <Sheet open={open} onClose={onClose} title="Privacy and data">
      <div className="card stack">
        <h3>Where your info lives</h3>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
          <li>Your confirmed numbers are saved in this browser’s storage on this device. They are not encrypted.</li>
          <li>Nothing is sent to a server. Finfriend has no bank connection.</li>
          <li>Screenshots and recordings are read on this device, then discarded. They are never saved.</li>
        </ul>
      </div>
      <div className="card stack">
        <label className="check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          {hidden ? <EyeOff size={16} strokeWidth={2} aria-hidden /> : <Eye size={16} strokeWidth={2} aria-hidden />} Hide amounts now
        </label>
        <label className="check">
          <input type="checkbox" checked={state.settings.hideOnOpen} onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, hideOnOpen: e.target.checked } }))} />
          Hide amounts every time I open Finfriend
        </label>
      </div>
      <div className="card stack">
        <h3>Edit your setup</h3>
        <div className="chips">
          <button type="button" className="chip" onClick={() => onEdit('balance')}>
            Update balance
          </button>
          <button type="button" className="chip" onClick={() => onEdit('income')}>
            Next income
          </button>
          <button type="button" className="chip" onClick={() => onEdit('setup')}>
            Review setup answers
          </button>
        </div>
      </div>
      {confirm ? (
        <div className="card stack">
          <p>
            <strong>Delete everything?</strong> This removes your balance, transactions, bills, and goals from this browser. You’ll start setup again.
          </p>
          <div className="grid-2">
            <button type="button" className="btn secondary" onClick={() => setConfirm(false)}>
              Keep my data
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                clearAll()
                setConfirm(false)
                onClose()
              }}
            >
              Delete everything
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn danger block" onClick={() => setConfirm(true)}>
          <Trash2 size={16} strokeWidth={2} aria-hidden /> Clear all data
        </button>
      )}
    </Sheet>
  )
}

// ------------------------------------------------------------------ import more transactions later

function useHiddenMoney() {
  const { hidden } = useStore()
  return (n: number) => (hidden ? HIDDEN : money(n))
}

export function ImportSheet({ open, mode, onClose, onManual }: { open: boolean; mode: ImportMode; onClose: () => void; onManual: () => void }) {
  const { state, update, today } = useStore()
  const hiddenMoney = useHiddenMoney()
  const [m, setM] = useState<ImportMode>(mode)
  const [rows, setRows] = useState<DraftTxn[] | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [found, setFound] = useState<BalanceCandidate[]>([])
  const close = () => {
    setRows(null)
    setFound([])
    setShowErrors(false)
    onClose()
  }
  const included = rows?.filter((r) => r.include).length ?? 0
  const asOf = state.balance.asOf
  function save() {
    if (!rows) return
    if (invalidIncluded(rows, today).length) return setShowErrors(true)
    const add = rows.filter((r) => r.include).map((r) => draftToTxn(r, asOf))
    update((s) => ({ ...s, txns: [...add, ...s.txns] }))
    close()
  }
  return (
    <Sheet open={open} onClose={close} title={rows ? 'Check what Finfriend found' : 'Import transactions'}>
      {!rows ? (
        <>
          <div className="toggle2" role="group" aria-label="Import type" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            {(['screenshot', 'recording', 'csv'] as const).map((x) => (
              <button key={x} type="button" aria-pressed={m === x} onClick={() => setM(x)}>
                {x === 'screenshot' ? 'Screenshot' : x === 'recording' ? 'Recording' : 'CSV'}
              </button>
            ))}
          </div>
          <Importer
            key={m}
            mode={m}
            today={today}
            onDone={(r) => {
              // Rows that match something already saved start unchecked, so nothing is counted twice.
              for (const row of r.rows) {
                const dup = state.txns.some((t) => t.amount === row.amount && t.date === row.date && t.kind === row.kind && similarity(t.description, row.description) >= 0.6)
                if (dup) {
                  if (!row.flags.includes('possibleDuplicate')) row.flags.push('possibleDuplicate')
                  row.include = false
                }
              }
              setFound(r.balances)
              setRows(r.rows)
              setNotes(r.notes)
              setWarnings(r.warnings)
            }}
            onSwitch={(to) => {
              if (to === 'manual') {
                close()
                onManual()
              } else setM(to)
            }}
          />
        </>
      ) : (
        <>
          {asOf && (
            <Notice>
              Rows dated on or before {fmtShort(asOf)} count as already in your balance. Later rows change your cash.
            </Notice>
          )}
          {found.length > 0 && (
            <Notice>
              This file also shows a balance of {hiddenMoney(found[0].amount)}. Your saved balance doesn’t change unless you use Update balance.
            </Notice>
          )}
          {rows.length === 0 && <p className="caption">No transactions were found. Only a balance was visible. Use Update balance to change it.</p>}
          <RowsReview rows={rows} setRows={setRows} today={today} showErrors={showErrors} notes={notes} warnings={warnings} />
          <button type="button" className="btn primary block" onClick={save} disabled={included === 0}>
            Add {included} {included === 1 ? 'transaction' : 'transactions'}
          </button>
          <button type="button" className="btn ghost" onClick={close}>
            Cancel, save nothing
          </button>
        </>
      )}
    </Sheet>
  )
}

