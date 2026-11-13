import { scrollToTop } from '../../lib/scroll'
import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, PiggyBank, ShieldCheck, ShoppingBag, Trash2, Wallet } from 'lucide-react'
import { computePlan, horizon, missingEssentials } from '../../lib/calc'
import { addDays, endOfMonth, fmtDay, fmtRange, fmtShort } from '../../lib/dates'
import { money, sum } from '../../lib/money'
import { uid, usesCard, type Bill, type FinState, type IncomePattern } from '../../lib/types'
import { useStore } from '../../state/store'
import { BackButton, DateInput, Field, MoneyInput, Notice, Option, Progress } from '../../components/ui'
import { BalanceStep, InlineUpload, PayTxnStep } from './DataStep'
import { PoolProvider, usePool } from './pool'
import { depositsFrom, guessSchedule } from '../../lib/deposits'
import { Breakdown } from '../dashboard/Breakdown'

const TOTAL = 8

import { Footer } from './Footer'
import { analyticsAvailable, track } from '../../lib/analytics'

const STEP_NAMES = ['welcome', 'income_schedule', 'income_amount', 'balance', 'bills', 'pay_and_transactions', 'savings', 'review']
const ONBOARDING_START = 'ff.onboarding.start'

export function Onboarding() {
  const { state, update } = useStore()
  const step = state.onboarding.step
  const go = (n: number) => {
    update((s) => ({ ...s, onboarding: { ...s.onboarding, step: n } }))
    scrollToTop()
  }
  // One event per step shown, so the study can see where people stop.
  useEffect(() => {
    track('onboarding_step_viewed', { step: step + 1, step_name: STEP_NAMES[step] ?? 'unknown' })
  }, [step])

  return (
    <PoolProvider initial={state.txns}>
    <main className="page ob">
      {step > 0 && (
        <div className="stack-sm">
          <div className="ob-top">
            <BackButton onClick={() => go(step - 1)} />
            <span className="wordmark" aria-hidden>
              Finfriend
            </span>
          </div>
          <Progress step={step + 1} total={TOTAL} />
        </div>
      )}
      {step === 0 && <Welcome next={() => go(1)} />}
      {step === 1 && <Income next={() => go(2)} />}
      {step === 2 && <IncomeAmount next={() => go(3)} />}
      {step === 3 && <BalanceStep next={() => go(4)} />}
      {step === 4 && <Expenses next={() => go(5)} />}
      {step === 5 && <PayTxnStep next={() => go(6)} />}
      {step === 6 && <Savings next={() => go(7)} />}
      {step === 7 && <Summary go={go} />}
    </main>
    </PoolProvider>
  )
}

// ------------------------------------------------------------------ 1. Welcome

function Welcome({ next }: { next: () => void }) {
  const { loadSample } = useStore()
  return (
    <>
      {/* Drop the official gradient "f" logo here. A replacement mark is intentionally not drawn. */}
      <span className="wordmark" style={{ paddingTop: 24 }}>
        Finfriend
      </span>
      <div className="welcome-body">
      <h1 style={{ fontSize: 34 }}>A clearer view of what’s important to you.</h1>
      <div className="benefits">
        <div className="benefit">
          <span className="option-icon">
            <Wallet size={20} strokeWidth={2} aria-hidden />
          </span>
          <p>See what you can spend today, after your bills and savings are covered.</p>
        </div>
        <div className="benefit">
          <span className="option-icon">
            <CalendarClock size={20} strokeWidth={2} aria-hidden />
          </span>
          <p>Follow your week so you know if your spending is on pace.</p>
        </div>
        <div className="benefit">
          <span className="option-icon">
            <ShoppingBag size={20} strokeWidth={2} aria-hidden />
          </span>
          <p>Check a purchase first, so you know how it affects the days ahead.</p>
        </div>
      </div>
      <Notice icon={<ShieldCheck size={20} strokeWidth={2} aria-hidden />}>
        No bank login needed. You choose what to share, and rough numbers work fine.
        {analyticsAvailable && ' For this study, Finfriend counts which screens you use. It never sends your amounts, and you can turn this off in Privacy.'}
      </Notice>
      </div>
      <Footer
        label="Get started"
        onClick={() => {
          try {
            sessionStorage.setItem(ONBOARDING_START, String(Date.now()))
          } catch {
            /* timing is optional */
          }
          track('onboarding_started')
          next()
        }}
        secondary={
          <button type="button" className="btn ghost" onClick={() => { loadSample(); scrollToTop() }}>
            See a demo with sample data
          </button>
        }
      />
    </>
  )
}

// ------------------------------------------------------------------ 4. Income

const PATTERNS: { id: IncomePattern; title: string; desc?: string }[] = [
  { id: 'weekly', title: 'Weekly pay' },
  { id: 'biweekly', title: 'Every two weeks' },
  { id: 'monthly', title: 'Monthly pay' },
  { id: 'irregular', title: 'Irregular income', desc: 'Gig work, tips, or changing hours' },
  { id: 'support', title: 'Financial aid or family support' },
  { id: 'other', title: 'Other' },
]

export function IncomeFields({ part = 'all' }: { part?: 'all' | 'schedule' | 'amount' } = {}) {
  const { state, update, today } = useStore()
  const inc = state.income
  const set = (patch: Partial<FinState['income']>) => update((s) => ({ ...s, income: { ...s.income, ...patch } }))
  const [noDate, setNoDate] = useState(inc.nextDate === null && inc.planUntil !== null)
  const dateError = inc.nextDate && inc.nextDate <= today ? 'Pick a date after today. If money arrived today, add it to your balance.' : null
  const untilError = inc.planUntil && inc.planUntil < today ? 'Pick today or a later date.' : null

  return {
    valid: part === 'amount' ? true : !!inc.pattern && !dateError && !untilError,
    ui: (
    <>
      {part !== 'amount' && (<>
      <div className="options" role="radiogroup" aria-label="How you get money">
        {PATTERNS.map((p) => (
          <Option key={p.id} checked={inc.pattern === p.id} onClick={() => set({ pattern: p.id })} title={p.title} desc={p.desc} />
        ))}
      </div>

      {inc.pattern && (
        <div className="card stack">
          <h3>When do you expect money next?</h3>
          {inc.pattern === 'irregular' && (
            <p className="caption">If you know a likely date, add it. If not, choose how long your current money should last.</p>
          )}
          {!noDate && (
            <>
              <Field label="Next income date" htmlFor="next-date" error={dateError}>
                <DateInput id="next-date" value={inc.nextDate} onChange={(v) => set({ nextDate: v })} min={addDays(today, 1)} />
              </Field>
              <label className="check">
                <input type="checkbox" checked={!inc.dateSure} onChange={(e) => set({ dateSure: !e.target.checked })} />
                This date is my best guess
              </label>
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={noDate}
              onChange={(e) => {
                setNoDate(e.target.checked)
                if (e.target.checked) set({ nextDate: null })
                else set({ planUntil: null })
              }}
            />
            I don’t know when
          </label>
          {noDate && (
            <Field label="How long should your current money last?" htmlFor="plan-until" error={untilError} hint="Finfriend spreads your spending money evenly through this date.">
              <div className="chips">
                {[
                  { label: '1 week', d: addDays(today, 6) },
                  { label: '2 weeks', d: addDays(today, 13) },
                  { label: 'End of month', d: endOfMonth(today) },
                ].map((c) => (
                  <button key={c.label} type="button" className="chip" aria-pressed={inc.planUntil === c.d} onClick={() => set({ planUntil: c.d })}>
                    {c.label}
                  </button>
                ))}
              </div>
              <DateInput id="plan-until" value={inc.planUntil} onChange={(v) => set({ planUntil: v })} min={today} />
            </Field>
          )}
        </div>
      )}

      </>)}
      {(part === 'amount' || (part === 'all' && inc.pattern)) && (
        <div className="card stack">
          {part === 'all' && (
            <div className="stack-sm">
              <h3>How much do you expect?</h3>
              <p className="caption">This is for your reference. It isn’t added to your safe-to-spend until it arrives.</p>
            </div>
          )}
          <div className="chips" role="group" aria-label="Expected amount">
            {(
              [
                ['exact', 'I know the amount'],
                ['range', 'A range'],
                ['unknown', 'Not sure'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={inc.amountKind === k} onClick={() => set({ amountKind: k, ...(k === 'unknown' ? { amount: null, amountMax: null } : {}) })}>
                {l}
              </button>
            ))}
          </div>
          {inc.amountKind === 'exact' && (
            <Field label="Amount" htmlFor="inc-amt">
              <MoneyInput id="inc-amt" value={inc.amount} onChange={(amount) => set({ amount })} />
            </Field>
          )}
          {inc.amountKind === 'range' && (
            <div className="grid-2">
              <Field label="At least" htmlFor="inc-min">
                <MoneyInput id="inc-min" value={inc.amount} onChange={(amount) => set({ amount })} />
              </Field>
              <Field label="At most" htmlFor="inc-max">
                <MoneyInput id="inc-max" value={inc.amountMax} onChange={(amountMax) => set({ amountMax })} />
              </Field>
            </div>
          )}
        </div>
      )}
    </>
    ),
  }
}

function Income({ next }: { next: () => void }) {
  const { valid, ui } = IncomeFields({ part: 'schedule' })
  return (
    <>
      <div className="stack-sm">
        <h1>How does money come into your account?</h1>
        <p className="muted">Finfriend plans until your next money arrives. It never counts money you haven’t received.</p>
      </div>
      {ui}
      <Footer label="Continue" onClick={next} disabled={!valid} />
    </>
  )
}

// ------------------------------------------------------------------ 3. Income amount

function IncomeAmount({ next }: { next: () => void }) {
  const { state, update, today } = useStore()
  const pool = usePool()
  const { ui } = IncomeFields({ part: 'amount' })
  const deposits = depositsFrom(pool.rows)
  const guess = guessSchedule(deposits, today)
  const inc = state.income
  const guessApplied = guess && inc.pattern === guess.pattern && inc.nextDate === guess.nextDate
  const guessPattern = guess?.pattern ?? null
  useEffect(() => {
    if (guessPattern) track('deposit_schedule_suggested', { pattern: guessPattern })
  }, [guessPattern])
  return (
    <>
      <div className="stack-sm">
        <h1>How much comes in?</h1>
        <p className="muted">Type it in or find it in a screenshot of your deposits. It’s for reference and isn’t counted until it arrives.</p>
      </div>
      {ui}
      <InlineUpload modes={['screenshot']} label="Or find it in a screenshot" />
      {deposits.length > 0 && (
        <div className="card stack">
          <div className="stack-sm">
            <h3>Deposits Finfriend found</h3>
            <p className="caption">Tap one to use it as your expected amount.</p>
          </div>
          <div className="chips">
            {deposits.slice(0, 6).map((d, i) => (
              <button
                key={i}
                type="button"
                className="chip"
                aria-pressed={inc.amountKind === 'exact' && inc.amount === d.amount}
                onClick={() => update((s) => ({ ...s, income: { ...s.income, amountKind: 'exact', amount: d.amount, amountMax: null } }))}
              >
                {d.description} · {fmtShort(d.date)} · {money(d.amount)}
              </button>
            ))}
          </div>
          {guess && (
            <Notice>
              <strong>{guess.source}</strong> looks like it comes {guess.label} ({guess.dates.map(fmtShort).join(', ')}). The next one would be {fmtDay(guess.nextDate)}.
              <div style={{ marginTop: 8 }}>
                {guessApplied ? (
                  <span className="caption">Using this as your schedule. It’s marked as a best guess.</span>
                ) : (
                  <button
                    type="button"
                    className="btn soft sm"
                    onClick={() => {
                      update((s) => ({ ...s, income: { ...s.income, pattern: guess.pattern, nextDate: guess.nextDate, dateSure: false, planUntil: null } }))
                      track('deposit_schedule_applied', { pattern: guess.pattern })
                    }}
                  >
                    Use this schedule
                  </button>
                )}
              </div>
            </Notice>
          )}
        </div>
      )}
      <Footer label="Continue" onClick={next} />
    </>
  )
}

// ------------------------------------------------------------------ 5. Expenses

const BILL_SUGGESTIONS = ['Rent', 'Groceries', 'Subscriptions', 'Utilities', 'Transportation', 'Phone']

export function BillEditor({ bill, onChange, onDelete, today }: { bill: Bill; onChange: (b: Bill) => void; onDelete: () => void; today: string }) {
  return (
    <div className="editor-row">
      <div className="between">
        <input className="input compact grow" placeholder="What is it?" aria-label="Expense name" value={bill.label} onChange={(e) => onChange({ ...bill, label: e.target.value })} />
        <button type="button" className="icon-btn" onClick={onDelete} aria-label={`Remove ${bill.label || 'this expense'}`}>
          <Trash2 size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="grid-2">
        <div className="stack-sm">
          <span className="label">Amount</span>
          {!bill.amountUnknown ? (
            <MoneyInput compact value={bill.amount} onChange={(amount) => onChange({ ...bill, amount })} ariaLabel={`${bill.label || 'Expense'} amount`} />
          ) : (
            <span className="caption" style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>Amount unknown</span>
          )}
          <label className="check small">
            <input type="checkbox" checked={!!bill.amountUnknown} onChange={(e) => onChange({ ...bill, amount: null, amountUnknown: e.target.checked })} />
            Not sure
          </label>
        </div>
        <div className="stack-sm">
          <span className="label">Due date</span>
          {!bill.dateUnknown ? (
            <DateInput compact value={bill.dueDate} onChange={(dueDate) => onChange({ ...bill, dueDate })} ariaLabel={`${bill.label || 'Expense'} due date`} min={addDays(today, -60)} />
          ) : (
            <span className="caption" style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>Date unknown</span>
          )}
          <label className="check small">
            <input type="checkbox" checked={!!bill.dateUnknown} onChange={(e) => onChange({ ...bill, dueDate: null, dateUnknown: e.target.checked })} />
            Not sure
          </label>
        </div>
      </div>
    </div>
  )
}

export const billIncomplete = (b: Bill) => !b.label.trim() || (b.amount === null && !b.amountUnknown) || (b.dueDate === null && !b.dateUnknown)

function Expenses({ next }: { next: () => void }) {
  const { state, update, today } = useStore()
  const h = horizon(state, today)
  const by = h.end && h.source === 'income' ? `before ${fmtShort(state.income.nextDate!)}` : h.end ? `by ${fmtShort(h.end)}` : 'before your next income'
  const setBills = (bills: Bill[]) => update((s) => ({ ...s, bills }))
  const add = (label = '') => setBills([...state.bills, { id: uid(), label, amount: null, dueDate: null, paid: false }])
  const incomplete = state.bills.filter(billIncomplete)

  return (
    <>
      <div className="stack-sm">
        <h1>Anything due {by}?</h1>
        <p className="muted">Add bills or planned costs, so Finfriend sets that money aside first.</p>
      </div>
      <Notice>Use a credit card? Leave the card payment out of this list. Finfriend asks about your card in the next step.</Notice>
      <div className="options" role="radiogroup" aria-label="Upcoming expenses">
        <Option
          checked={state.billsAnswer === 'yes'}
          onClick={() => {
            update((s) => ({ ...s, billsAnswer: 'yes' }))
            if (state.bills.length === 0) add()
          }}
          title="Yes, I have some"
        />
        <Option checked={state.billsAnswer === 'none'} onClick={() => update((s) => ({ ...s, billsAnswer: 'none', bills: [] }))} title="Nothing coming up" />
      </div>

      {state.billsAnswer === 'yes' && (
        <div className="stack">
          <div className="stack-sm">
            <span className="label">Quick add</span>
            <div className="chips">
              {BILL_SUGGESTIONS.map((l) => (
                <button key={l} type="button" className="chip" onClick={() => add(l)}>
                  + {l}
                </button>
              ))}
            </div>
            <span className="caption">These add a label only. You enter the amount.</span>
          </div>
          <div className="list-editor">
            {state.bills.map((b) => (
              <BillEditor
                key={b.id}
                bill={b}
                today={today}
                onChange={(n) => setBills(state.bills.map((x) => (x.id === b.id ? n : x)))}
                onDelete={() => setBills(state.bills.filter((x) => x.id !== b.id))}
              />
            ))}
          </div>
          <button type="button" className="btn secondary" onClick={() => add()}>
            Add another
          </button>
          {incomplete.length > 0 && <p className="caption">Each item needs a name, an amount, and a due date. Tick “Not sure” for anything you don’t know.</p>}
        </div>
      )}

      <Footer
        label="Continue"
        onClick={next}
        disabled={!state.billsAnswer || incomplete.length > 0 || (state.billsAnswer === 'yes' && state.bills.length === 0)}
      />
    </>
  )
}

// ------------------------------------------------------------------ 6. Savings and buffer

export function SavingsFields() {
  const { state, update } = useStore()
  const sv = state.savings
  const bf = state.buffer
  const [svChoice, setSvChoice] = useState<'set' | 'skip' | null>(sv.skipped ? 'skip' : sv.protect !== null || sv.goalName ? 'set' : null)
  const [bfChoice, setBfChoice] = useState<'set' | 'skip' | null>(bf.skipped ? 'skip' : bf.amount !== null ? 'set' : null)
  const setSv = (p: Partial<FinState['savings']>) => update((s) => ({ ...s, savings: { ...s.savings, ...p } }))
  const setBf = (p: Partial<FinState['buffer']>) => update((s) => ({ ...s, buffer: { ...s.buffer, ...p } }))
  return {
    ready: svChoice !== null && bfChoice !== null,
    ui: (
      <>
        <div className="card stack">
          <div className="row">
            <span className="option-icon">
              <PiggyBank size={22} strokeWidth={2} aria-hidden />
            </span>
            <div className="grow">
              <h3>Savings goal</h3>
              <p className="caption">Money you protect is kept out of your safe-to-spend.</p>
            </div>
          </div>
          <div className="options" role="radiogroup" aria-label="Savings goal">
            <Option checked={svChoice === 'set'} onClick={() => { setSvChoice('set'); setSv({ skipped: false }) }} title="Protect money for a goal" />
            <Option checked={svChoice === 'skip'} onClick={() => { setSvChoice('skip'); setSv({ skipped: true }) }} title="Skip for now" />
          </div>
          {svChoice === 'set' && (
            <>
              <Field label="What are you saving for?" htmlFor="goal-name" hint="Optional">
                <input id="goal-name" className="input" value={sv.goalName} placeholder="A trip, a laptop, an emergency fund" onChange={(e) => setSv({ goalName: e.target.value })} />
              </Field>
              <Field label="Goal total" htmlFor="goal-total" hint="Optional. Helps you see progress.">
                <MoneyInput id="goal-total" value={sv.goalTarget} onChange={(goalTarget) => setSv({ goalTarget })} />
              </Field>
              <Field label="Amount to protect from your current balance" htmlFor="goal-protect" hint="Finfriend won’t count this as spending money.">
                <MoneyInput id="goal-protect" value={sv.protect} onChange={(protect) => setSv({ protect })} />
              </Field>
            </>
          )}
          {svChoice === 'skip' && <p className="caption">No money is held back for savings, so your safe-to-spend will be higher.</p>}
        </div>

        <div className="card stack">
          <div className="row">
            <span className="option-icon">
              <ShieldCheck size={22} strokeWidth={2} aria-hidden />
            </span>
            <div className="grow">
              <h3>Cash buffer</h3>
              <p className="caption">A buffer covers surprises, like a late fee or a ride home.</p>
            </div>
          </div>
          <div className="options" role="radiogroup" aria-label="Cash buffer">
            <Option checked={bfChoice === 'set'} onClick={() => { setBfChoice('set'); setBf({ skipped: false }) }} title="Keep a buffer" />
            <Option checked={bfChoice === 'skip'} onClick={() => { setBfChoice('skip'); setBf({ skipped: true }) }} title="Skip for now" />
          </div>
          {bfChoice === 'set' && (
            <Field label="Minimum to keep in your account" htmlFor="buffer">
              <MoneyInput id="buffer" value={bf.amount} onChange={(amount) => setBf({ amount })} />
            </Field>
          )}
          {bfChoice === 'skip' && <p className="caption">Finfriend will plan with every dollar left after bills. Surprise costs would come out of your spending money.</p>}
        </div>
      </>
    ),
  }
}

function Savings({ next }: { next: () => void }) {
  const { ready, ui } = SavingsFields()
  return (
    <>
      <div className="stack-sm">
        <h1>Want to protect some money?</h1>
        <p className="muted">Both are optional. Each one lowers your safe-to-spend so that money stays put.</p>
      </div>
      {ui}
      <Footer label="Continue" onClick={next} disabled={!ready} />
    </>
  )
}

// ------------------------------------------------------------------ 7. Summary

function Summary({ go }: { go: (n: number) => void }) {
  const { state, update, today } = useStore()
  const missing = missingEssentials(state, today)
  const plan = computePlan(state, today)
  const unpaid = state.bills
  const unknown = unpaid.filter((b) => b.amount === null)
  const txns = state.txns
  const earliest = txns.length ? txns.reduce((m, t) => (t.date < m ? t.date : m), txns[0].date) : null
  const latest = txns.length ? txns.reduce((m, t) => (t.date > m ? t.date : m), txns[0].date) : null
  const finish = () => {
    let seconds: number | null = null
    try {
      const t = Number(sessionStorage.getItem(ONBOARDING_START))
      if (t) seconds = Math.round((Date.now() - t) / 1000)
    } catch {
      /* timing is optional */
    }
    // Yes/no flags and counts only, never the amounts themselves.
    track('onboarding_completed', {
      seconds_taken: seconds,
      pay_method: state.payMethod ?? 'none',
      income_pattern: state.income.pattern ?? 'none',
      has_balance: state.balance.amount !== null,
      balance_from_upload: state.balance.source === 'screenshot' || state.balance.source === 'recording',
      has_income_date: !!state.income.nextDate,
      uses_plan_until: !state.income.nextDate && !!state.income.planUntil,
      bills_count: state.bills.length,
      bills_unknown_amount: unknown.length,
      transactions_count: txns.length,
      savings_set: !state.savings.skipped && !!state.savings.protect,
      buffer_set: !state.buffer.skipped && !!state.buffer.amount,
      missing_count: missing.length,
      estimate_ready: plan.ok,
    })
    update((s) => ({ ...s, onboarding: { ...s.onboarding, complete: true } }))
    scrollToTop()
  }
  const Row = ({ label, value, step }: { label: string; value: ReactNode; step: number }) => (
    <div className="summary-row">
      <div className="grow">
        <div className="caption">{label}</div>
        <div style={{ fontWeight: 500 }}>{value}</div>
      </div>
      <button type="button" className="link" onClick={() => go(step)} aria-label={`Edit ${label}`}>
        Edit
      </button>
    </div>
  )
  const inc = state.income
  const incomeText = inc.nextDate
    ? `${fmtDay(inc.nextDate)}${inc.dateSure ? '' : ' (best guess)'}${inc.amountKind === 'exact' && inc.amount !== null ? `, about ${money(inc.amount)}` : inc.amountKind === 'range' && inc.amount !== null && inc.amountMax !== null ? `, ${money(inc.amount)} to ${money(inc.amountMax)}` : ''}`
    : inc.planUntil
      ? `Not sure. Planning through ${fmtDay(inc.planUntil)}.`
      : 'Not added yet'

  return (
    <>
      <div className="stack-sm">
        <h1>Review your financial picture</h1>
        <p className="muted">Check these numbers, then build your dashboard. Tap Edit to change anything.</p>
      </div>
      <div className="card list">
        <Row
          label="How you pay"
          value={state.payMethod === 'debit' ? 'Debit card or cash' : state.payMethod === 'credit' ? 'Credit card' : state.payMethod === 'both' ? 'Debit and credit' : 'Not answered'}
          step={5}
        />
        <Row label={usesCard(state) ? 'Bank account balance' : 'Available balance'} value={state.balance.amount !== null ? `${money(state.balance.amount)} on ${fmtShort(state.balance.asOf!)}` : 'Not added yet'} step={3} />
        {usesCard(state) && (
          <Row
            label="Credit card"
            value={
              state.card.owed === null
                ? 'Not added yet'
                : state.card.payInFull === false
                  ? `${money(state.card.owed)} owed. Setting aside ${money(state.card.planPay ?? 0)} for your next payment.`
                  : `${money(state.card.owed)} owed, paid in full${state.card.dueDate ? ` by ${fmtShort(state.card.dueDate)}` : ''}`
            }
            step={5}
          />
        )}
        <Row label="Next expected income" value={incomeText} step={1} />
        <Row
          label="Upcoming expenses"
          value={
            unpaid.length === 0
              ? 'None added'
              : `${money(sum(unpaid.map((b) => b.amount ?? 0)))} across ${unpaid.length} ${unpaid.length === 1 ? 'item' : 'items'}${unknown.length ? `, ${unknown.length} with unknown amount` : ''}`
          }
          step={4}
        />
        <Row
          label="Recent spending in your balance"
          value={state.pending.answer === 'included' ? 'Up to date' : state.pending.answer === 'notIncluded' ? `${money(state.pending.amount ?? 0)} still pending` : state.pending.answer === 'unsure' ? 'Not sure' : 'Not answered'}
          step={3}
        />
        <Row
          label="Savings"
          value={state.savings.skipped || !state.savings.protect ? 'Nothing protected' : `${money(state.savings.protect)} protected${state.savings.goalName ? ` for ${state.savings.goalName}` : ''}`}
          step={6}
        />
        <Row label="Cash buffer" value={state.buffer.skipped || !state.buffer.amount ? 'No buffer' : money(state.buffer.amount)} step={6} />
        <Row
          label="Transaction history"
          value={txns.length ? `${txns.length} ${txns.length === 1 ? 'transaction' : 'transactions'}, ${fmtRange(earliest!, latest!)}` : 'None yet. Pace appears once you add some.'}
          step={5}
        />
      </div>

      {missing.length > 0 ? (
        <Notice tone="alert">
          <strong>Finfriend needs this for a safe-to-spend estimate:</strong>
          <ul>
            {missing.map((m) => (
              <li key={m.key}>
                {m.text}{' '}
                <button type="button" className="link" onClick={() => go(m.step)}>
                  Add it
                </button>
              </li>
            ))}
          </ul>
        </Notice>
      ) : (
        <div className="card stack">
          <div className="stack-sm">
            <span className="eyebrow">Your starting estimate</span>
            <h2>
              {money(Math.max(0, plan.leftToday))} safe to spend today
            </h2>
          </div>
          <Breakdown plan={plan} hiddenOverride={false} />
        </div>
      )}
      <Footer
        label={missing.length ? 'Add missing info' : 'Build my dashboard'}
        onClick={missing.length ? () => go(missing[0].step) : finish}
        secondary={
          missing.length > 0 ? (
            <button type="button" className="btn ghost" onClick={finish}>
              Continue without an estimate
            </button>
          ) : undefined
        }
      />
    </>
  )
}
