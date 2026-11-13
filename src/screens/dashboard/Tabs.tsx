import { track } from '../../lib/analytics'
import { useState } from 'react'
import { AlertCircle, CheckCircle2, CreditCard, FileUp, Plus } from 'lucide-react'
import { computePlan } from '../../lib/calc'
import { categoryLabel, suggestCategory } from '../../lib/categories'
import { fmtDay, fmtRange, fmtShort } from '../../lib/dates'
import { uid, type Bill } from '../../lib/types'
import { useFinance, useStore } from '../../state/store'
import { Amount, Notice, Option, Sheet } from '../../components/ui'
import { BillEditor, billIncomplete, SavingsFields } from '../onboarding/Onboarding'
import { sortTxns, TxnRow } from './Home'
import type { UI } from './Shell'

// ------------------------------------------------------------------ Activity

export function Activity({ ui, filter, setFilter }: { ui: UI; filter: string | null; setFilter: (f: string | null) => void }) {
  const { state } = useStore()
  const all = sortTxns(state.txns)
  const cats = [...new Set(state.txns.map((t) => t.category))]
  const shown = all.filter((t) => !filter || (filter === 'expense' || filter === 'income' ? t.kind === filter : t.category === filter))
  const groups = new Map<string, typeof shown>()
  for (const t of shown) groups.set(t.date, [...(groups.get(t.date) ?? []), t])
  const first = all.length ? all[all.length - 1].date : null
  const last = all.length ? all[0].date : null

  return (
    <main className="page with-nav">
      <div className="between">
        <h1>Activity</h1>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="icon-btn" onClick={() => ui.openImport('screenshot')} aria-label="Import transactions">
            <FileUp size={20} strokeWidth={2} aria-hidden />
          </button>
          <button type="button" className="icon-btn" onClick={() => ui.openTxn(null)} aria-label="Add a transaction">
            <Plus size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
      {all.length > 0 && (
        <p className="caption">
          {all.length} {all.length === 1 ? 'transaction' : 'transactions'}, {fmtRange(first!, last!)}. Only what you added or confirmed.
        </p>
      )}
      {all.length > 0 && (
        <div className="chip-scroll" role="group" aria-label="Filter transactions">
          {[
            { id: null, label: 'All' },
            { id: 'expense', label: 'Spending' },
            { id: 'income', label: 'Income' },
            ...cats.map((c) => ({ id: c, label: categoryLabel(c) })),
          ].map((c) => (
            <button key={c.id ?? 'all'} type="button" className="chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {all.length === 0 ? (
        <div className="card empty">
          <h3>Your spending starts here</h3>
          <p className="caption">Add a purchase by hand, or import a screenshot, recording, or CSV.</p>
          <div className="row">
            <button type="button" className="btn primary sm" onClick={() => ui.openTxn(null)}>
              Add expense
            </button>
            <button type="button" className="btn secondary sm" onClick={() => ui.openImport('screenshot')}>
              Import
            </button>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <p className="caption">Nothing matches this filter.</p>
      ) : (
        <div className="card list">
          {[...groups.entries()].map(([date, ts]) => (
            <div key={date}>
              <div className="date-group">{fmtDay(date)}</div>
              {ts.map((t) => (
                <TxnRow key={t.id} t={t} onOpen={() => ui.openTxn(t.id)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

// ------------------------------------------------------------------ Bills

function BillRow({ b, onEdit, onPaid, overdue }: { b: Bill; onEdit: () => void; onPaid: () => void; overdue?: boolean }) {
  return (
    <div className="txn" style={{ cursor: 'default' }}>
      <div className="grow">
        <div className="name">{b.label}</div>
        <div className="meta" style={overdue ? { color: 'var(--color-alert)' } : undefined}>
          {overdue && <AlertCircle size={12} strokeWidth={2} aria-hidden style={{ marginRight: 4 }} />}
          {b.paid ? 'Paid' : b.dueDate ? `${overdue ? 'Was due' : 'Due'} ${fmtDay(b.dueDate)}` : 'Due date unknown'}
        </div>
      </div>
      <div className="stack-sm" style={{ alignItems: 'flex-end', gap: 4 }}>
        {b.amount !== null ? <Amount value={b.amount} className="amt" /> : <span className="tag">Amount unknown</span>}
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="link small" onClick={onEdit}>
            Edit
          </button>
          {!b.paid && (
            <button type="button" className="link small" onClick={onPaid}>
              · Mark paid
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function Bills({ ui }: { ui: UI }) {
  const { state, update, today } = useStore()
  const { plan } = useFinance()
  const [editing, setEditing] = useState<Bill | null>(null)
  const [paying, setPaying] = useState<Bill | null>(null)
  const saveBill = (b: Bill) => update((s) => ({ ...s, billsAnswer: 'yes', bills: s.bills.some((x) => x.id === b.id) ? s.bills.map((x) => (x.id === b.id ? b : x)) : [...s.bills, b] }))
  const overdue = plan.billsOverdue
  const counted = plan.billsCounted.filter((b) => !overdue.includes(b))
  const later = plan.billsLater
  const paid = state.bills.filter((b) => b.paid)
  const until = plan.horizonEnd ? (plan.horizonSource === 'income' ? `before ${fmtShort(plan.incomeDate!)}` : `by ${fmtShort(plan.horizonEnd)}`) : 'before your next income'

  function markPaid(b: Bill, addTxn: boolean) {
    track('bill_marked_paid', { added_payment: addTxn })
    update((s) => ({
      ...s,
      bills: s.bills.map((x) => (x.id === b.id ? { ...x, paid: true } : x)),
      txns:
        addTxn && b.amount !== null
          ? [{ id: uid(), description: b.label, date: today, amount: b.amount, kind: 'expense', category: suggestCategory(b.label, 'expense').sure ? suggestCategory(b.label, 'expense').id : 'bills', source: 'manual', inBalance: false }, ...s.txns]
          : s.txns,
    }))
    setPaying(null)
  }

  const Section = ({ title, items, hint, isOverdue }: { title: string; items: Bill[]; hint?: string; isOverdue?: boolean }) =>
    items.length ? (
      <section className="stack-sm">
        <h3>{title}</h3>
        {hint && <p className="caption">{hint}</p>}
        <div className="card list">
          {items.map((b) => (
            <BillRow key={b.id} b={b} overdue={isOverdue} onEdit={() => setEditing(b)} onPaid={() => setPaying(b)} />
          ))}
        </div>
      </section>
    ) : null

  return (
    <main className="page with-nav">
      <div className="between">
        <h1>Bills</h1>
        <button type="button" className="icon-btn" aria-label="Add a bill" onClick={() => setEditing({ id: uid(), label: '', amount: null, dueDate: null, paid: false })}>
          <Plus size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <p className="muted">Bills due {until} are set aside before Finfriend works out your spending money.</p>
      {plan.usesCard && (
        <section className="stack-sm" aria-labelledby="card-h">
          <h3 id="card-h">Credit card</h3>
          <div className="card list">
            <div className="txn" style={{ cursor: 'default' }}>
              <span className="txn-icon">
                <CreditCard size={20} strokeWidth={2} aria-hidden />
              </span>
              <div className="grow">
                <div className="name">{state.card.payInFull === false ? 'Next card payment' : 'Card balance, paid in full'}</div>
                <div className="meta">
                  {state.card.owed === null
                    ? 'Not added yet'
                    : state.card.dueDate
                      ? `Due ${fmtDay(state.card.dueDate)}`
                      : 'Due date not added'}
                </div>
              </div>
              <div className="stack-sm" style={{ alignItems: 'flex-end', gap: 4 }}>
                {state.card.owed !== null ? <Amount value={plan.cardSetAside} className="amt" /> : <span className="tag">Needs info</span>}
                <button type="button" className="link small" onClick={ui.openCard}>
                  Update
                </button>
              </div>
            </div>
          </div>
          <p className="caption">
            Set aside from your spending money.
            {plan.cardRemaining > 0 && (
              <>
                {' '}You owe <Amount value={plan.cardOwed} /> in total. The other <Amount value={plan.cardRemaining} /> stays as card debt.
              </>
            )}
          </p>
        </section>
      )}
      {state.bills.length === 0 && !plan.usesCard && (
        <div className="card empty">
          <h3>No bills added</h3>
          <p className="caption">Add rent, subscriptions, or anything else coming up, so Finfriend keeps that money aside.</p>
          <button type="button" className="btn primary sm" onClick={() => setEditing({ id: uid(), label: '', amount: null, dueDate: null, paid: false })}>
            Add a bill
          </button>
        </div>
      )}
      <Section title="Overdue" items={overdue} isOverdue hint="Mark these paid if you already paid them." />
      <Section title="Set aside now" items={counted} />
      {counted.length > 0 && (
        <p className="caption">
          Total set aside: <Amount value={plan.billsTotal} />
          {plan.billsUnknownAmount.length > 0 ? `, not counting ${plan.billsUnknownAmount.length} with unknown amounts` : ''}.
        </p>
      )}
      <Section title="Later" items={later} hint="Due after your next income, so not subtracted yet." />
      <Section title="Paid" items={paid} />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing && state.bills.some((b) => b.id === editing.id) ? 'Edit bill' : 'Add a bill'}>
        {editing && (
          <>
            <BillEditor
              bill={editing}
              today={today}
              onChange={setEditing}
              onDelete={() => {
                update((s) => ({ ...s, bills: s.bills.filter((b) => b.id !== editing.id) }))
                setEditing(null)
              }}
            />
            {billIncomplete(editing) && <p className="caption">Add a name, an amount, and a due date. Tick “Not sure” for anything you don’t know.</p>}
            <button
              type="button"
              className="btn primary block"
              disabled={billIncomplete(editing)}
              onClick={() => {
                saveBill(editing)
                setEditing(null)
              }}
            >
              Save bill
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={!!paying} onClose={() => setPaying(null)} title={`Mark ${paying?.label ?? ''} paid`}>
        {paying && (
          <>
            <p className="muted">Has this payment already come out of the balance you gave Finfriend?</p>
            <div className="options">
              <button type="button" className="option" onClick={() => markPaid(paying, false)}>
                <CheckCircle2 size={20} strokeWidth={2} aria-hidden />
                <span className="grow">
                  <span className="title" style={{ display: 'block' }}>Yes, my balance already shows it</span>
                  <span className="desc">Finfriend stops setting it aside.</span>
                </span>
              </button>
              {paying.amount !== null && (
                <button type="button" className="option" onClick={() => markPaid(paying, true)}>
                  <Plus size={20} strokeWidth={2} aria-hidden />
                  <span className="grow">
                    <span className="title" style={{ display: 'block' }}>No, add it as a payment today</span>
                    <span className="desc">Records <Amount value={paying.amount} /> and lowers your cash.</span>
                  </span>
                </button>
              )}
            </div>
          </>
        )}
      </Sheet>
    </main>
  )
}

// ------------------------------------------------------------------ Goals

export function Goals({ ui }: { ui: UI }) {
  const { state, update, today } = useStore()
  const { ui: fields } = SavingsFields()
  const p = computePlan(state, today)
  const sv = state.savings
  const progress = !sv.skipped && sv.goalTarget && sv.protect ? Math.min(1, sv.protect / sv.goalTarget) : null
  return (
    <main className="page with-nav">
      <h1>Goals</h1>
      <p className="muted">Protected money stays out of your safe-to-spend. Changes update your dashboard right away.</p>
      <div className="card stack">
        <div className="between">
          <span className="caption">Kept out of spending money</span>
          <Amount value={p.protectedSavings + p.buffer} className="label" />
        </div>
        {progress !== null && (
          <div className="stack-sm">
            <div className="progress-bar" aria-hidden>
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="caption">
              <Amount value={sv.protect!} /> of <Amount value={sv.goalTarget!} /> {sv.goalName ? `for ${sv.goalName}` : ''}
            </p>
          </div>
        )}
      </div>
      {fields}
      <div className="card stack">
        <h3>Your income plan</h3>
        <p className="caption">
          {state.income.nextDate ? `Next income ${fmtDay(state.income.nextDate)}${state.income.dateSure ? '' : ', a guess'}.` : state.income.planUntil ? `Planning through ${fmtDay(state.income.planUntil)}.` : 'No income date yet.'}
        </p>
        <div className="row">
          <button type="button" className="btn soft sm" onClick={ui.openIncome}>
            Edit income
          </button>
          <button type="button" className="btn ghost sm" onClick={ui.openBalance}>
            Update balance
          </button>
        </div>
      </div>
      {state.pending.answer === 'notIncluded' && (
        <Notice>
          You said <Amount value={state.pending.amount ?? 0} /> was still pending. Update your balance once it clears.
          <div style={{ marginTop: 8 }}>
            <button type="button" className="link" onClick={() => update((s) => ({ ...s, pending: { answer: 'included', amount: null } }))}>
              It cleared, and my balance is up to date
            </button>
          </div>
        </Notice>
      )}
      <Option checked={false} onClick={ui.openSettings} title="Privacy and data" desc="Hide today’s amount, update setup, or clear everything" />
      <button type="button" className="btn ghost" onClick={() => ui.openActivity(null)}>
        See all transactions
      </button>
    </main>
  )
}
