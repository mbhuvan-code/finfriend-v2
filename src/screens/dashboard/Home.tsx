import { AlertCircle, AlertTriangle, CheckCircle2, CircleHelp, Eye, EyeOff, FileUp, Plus, Settings, ShoppingBag } from 'lucide-react'
import { PERIODS, safeToday, type CategoryTotal, type PeriodSummary } from '../../lib/calc'
import { categoryLabel } from '../../lib/categories'
import { diffDays, fmtDay, fmtLongHeader, fmtRange, fmtRelative, fmtShort } from '../../lib/dates'
import { money } from '../../lib/money'
import type { Txn } from '../../lib/types'
import { useFinance, useStore } from '../../state/store'
import { Amount } from '../../components/ui'
import { CHART, Donut, type Slice } from '../../components/Donut'
import { CategoryIcon } from './icons'
import type { UI } from './Shell'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function sortTxns(t: Txn[]) {
  return [...t].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
}

export function TxnRow({ t, onOpen }: { t: Txn; onOpen: () => void }) {
  const { today } = useStore()
  return (
    <button type="button" className="txn" onClick={onOpen}>
      <span className={`txn-icon ${t.kind === 'income' ? 'income' : ''}`}>
        <CategoryIcon id={t.category} />
      </span>
      <span className="grow">
        <span className="name" style={{ display: 'block' }}>
          {t.description}
        </span>
        <span className="meta" style={{ display: 'block' }}>
          {categoryLabel(t.category)} · {fmtRelative(t.date, today)}
        </span>
      </span>
      <Amount value={t.amount} signed={t.kind} className={`amt ${t.kind === 'income' ? 'income' : ''}`} />
    </button>
  )
}

function buildSlices(cats: CategoryTotal[], remaining: number | null): Slice[] {
  const colors = [CHART.pink, CHART.plum, CHART.muted]
  const top = cats.slice(0, 3).map((c, i) => ({ key: c.category, label: categoryLabel(c.category), value: c.amount, color: colors[i] }))
  const rest = cats.slice(3)
  if (rest.length) top.push({ key: 'rest', label: `Everything else (${rest.length})`, value: rest.reduce((s, c) => s + c.amount, 0), color: CHART.muted, hatched: true } as Slice)
  if (remaining !== null && remaining > 0) top.push({ key: 'left', label: 'Left to spend', value: remaining, color: CHART.purple })
  return top
}

function SpendingCard({ s, ui }: { s: PeriodSummary; ui: UI }) {
  const { state } = useStore()
  const noun = PERIODS.find((p) => p.id === s.id)!.noun
  const slices = buildSlices(s.byCategory, s.remaining)
  const hasHistory = state.txns.length > 0
  const over = s.remaining !== null && s.remaining < 0

  if (!hasHistory && s.remaining === null) {
    return (
      <div className="card empty">
        <span className="option-icon">
          <ShoppingBag size={26} strokeWidth={2} aria-hidden />
        </span>
        <h3>Your spending starts here</h3>
        <p className="caption">Add a purchase or import transactions to see where your money goes.</p>
        <div className="row">
          <button type="button" className="btn primary sm" onClick={() => ui.openTxn(null)}>
            <Plus size={16} strokeWidth={2} aria-hidden /> Add a purchase
          </button>
          <button type="button" className="btn secondary sm" onClick={() => ui.openImport('screenshot')}>
            <FileUp size={16} strokeWidth={2} aria-hidden /> Import
          </button>
        </div>
      </div>
    )
  }

  const center =
    s.remaining !== null ? (
      over ? (
        <>
          <Amount value={-s.remaining} className="value" />
          <span className="caption">over plan {noun}</span>
        </>
      ) : (
        <>
          <Amount value={s.remaining} className="value" />
          <span className="caption">left {noun}</span>
        </>
      )
    ) : (
      <>
        <Amount value={s.spent} className="value" />
        <span className="caption">spent {noun}</span>
      </>
    )

  return (
    <section className="card stack" aria-labelledby="spend-h">
      <div className="between">
        <h3 id="spend-h">Spending {noun}</h3>
        <span className="caption">{fmtRange(s.start, s.end)}</span>
      </div>
      <Donut slices={slices} center={center} />
      <div className="legend">
        {s.byCategory.length === 0 && (
          <p className="caption" style={{ padding: '8px 0' }}>
            {hasHistory ? `No spending recorded ${noun} yet.` : 'No transactions yet. Add or import some to see categories.'}
          </p>
        )}
        {s.byCategory.map((c, i) => (
          <button
            key={c.category}
            type="button"
            className="legend-row"
            style={{ background: 'none', border: 0, width: '100%', textAlign: 'left' }}
            onClick={() => ui.openActivity(c.category)}
          >
            <span className="swatch" style={i < 3 ? { background: [CHART.pink, CHART.plum, CHART.muted][i] } : { background: `repeating-linear-gradient(45deg, ${CHART.muted} 0 2px, #fff 2px 4px)` }} aria-hidden />
            <span>
              {categoryLabel(c.category)}
              <span className="caption"> · {c.count}</span>
            </span>
            <Amount value={c.amount} className="amt" />
          </button>
        ))}
        {s.byCategory.length > 0 && (
          <div className="legend-row">
            <span className="swatch" style={{ background: 'transparent' }} aria-hidden />
            <span style={{ fontWeight: 600 }}>Total spent</span>
            <Amount value={s.spent} className="amt" />
          </div>
        )}
        {s.remaining !== null && (
          <>
            <div className="legend-divider" />
            <div className="legend-row">
              <span className="swatch" style={{ background: over ? 'transparent' : CHART.purple, border: over ? `2px solid ${CHART.purple}` : undefined }} aria-hidden />
              <span style={{ fontWeight: 600 }}>{over ? `Over plan ${noun}` : `Left to spend ${noun}`}</span>
              <Amount value={Math.abs(s.remaining)} className="amt" />
            </div>
          </>
        )}
      </div>
      {s.historyPartial && <p className="caption">Spending shown from {fmtShort(s.historyStart!)}, when your history starts.</p>}
      {s.remaining === null && <p className="caption">Add your balance and next income date to see what’s left {noun}.</p>}
      {s.uncoveredFrom && (
        <p className="caption">
          From {fmtShort(s.uncoveredFrom)}, your plan depends on your next income, so those days aren’t planned yet.
        </p>
      )}
      {s.income > 0 && (
        <p className="caption">
          Income {noun}: <Amount value={s.income} /> (not part of this chart).
        </p>
      )}
    </section>
  )
}

function PaceCard() {
  const { plan, summary, pace } = useFinance()
  const { state } = useStore()
  const noun = PERIODS.find((p) => p.id === summary.id)!.noun
  const bigBills = summary.billsDueInPeriod
  return (
    <section className="card stack" aria-labelledby="pace-h">
      <div className="between">
        <h3 id="pace-h">Spending pace</h3>
        {pace && (
          <span className="tag">
            {pace.state === 'above' ? <AlertTriangle size={14} strokeWidth={2} aria-hidden /> : <CheckCircle2 size={14} strokeWidth={2} aria-hidden />}
            {pace.state === 'above' ? 'Faster than plan' : pace.state === 'below' ? 'Slower than plan' : 'On pace'}
          </span>
        )}
      </div>
      {pace ? (
        <>
          <div>
            <div className="pace-gauge" aria-hidden>
              <div className={`fill ${pace.state === 'above' ? 'above' : ''}`} style={{ width: `${Math.max(2, pace.gauge * 100)}%` }} />
              <div className="mark" />
            </div>
            <div className="pace-scale" aria-hidden>
              <span>Slower</span>
              <span>Your plan</span>
              <span>Faster</span>
            </div>
          </div>
          <p>{pace.headline}</p>
          <p className="caption">{pace.detail}</p>
          {pace.state === 'above' && plan.daysLeft > 1 && summary.id !== 'today' && (
            <p className="caption">Keeping to <Amount value={plan.dailyAmount} /> a day from here keeps your bills and savings covered.</p>
          )}
        </>
      ) : (
        <p className="caption">
          {!plan.ok
            ? 'Pace appears once Finfriend has your balance and your next income date.'
            : state.txns.length === 0
              ? 'Pace appears once you add purchases. Finfriend compares them with your daily amount.'
              : summary.id === 'today'
                ? 'Pace for today appears once there is spending money in your plan.'
                : `Pace appears after one full day of history ${noun}.`}
        </p>
      )}
      {bigBills.map((b) => (
        <p key={b.id} className="small">
          {b.amount !== null ? (
            <>
              <strong>{b.label}</strong> (<Amount value={b.amount} />) is due {fmtShort(b.dueDate!)}. It’s already set aside, so it won’t come out of your spending money.
            </>
          ) : (
            <>
              <strong>{b.label}</strong> is due {fmtShort(b.dueDate!)} with no amount yet. Add it so your plan is complete.
            </>
          )}
        </p>
      ))}
    </section>
  )
}

export function Home({ ui }: { ui: UI }) {
  const { state, today, hidden, setHidden, period, setPeriod, saveError } = useStore()
  const { plan, summary, status } = useFinance()
  const recent = sortTxns(state.txns).slice(0, 5)
  const noun = PERIODS.find((p) => p.id === period)!.noun
  const incomePast = plan.missing.includes('horizonPast')
  const hero = safeToday(plan)

  return (
    <main className="page with-nav">
      <header className="dash-header">
        <div>
          <p className="eyebrow">{fmtLongHeader(today)}</p>
          <h1>{greeting()}</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="icon-btn" onClick={() => setHidden(!hidden)} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} aria-pressed={hidden}>
            {hidden ? <EyeOff size={20} strokeWidth={2} aria-hidden /> : <Eye size={20} strokeWidth={2} aria-hidden />}
          </button>
          <button type="button" className="icon-btn" onClick={ui.openSettings} aria-label="Privacy and data settings">
            <Settings size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </header>

      {saveError && (
        <div className="banner" role="alert">
          <AlertCircle size={20} strokeWidth={2} aria-hidden />
          <p className="small">This browser isn’t letting Finfriend save. Your changes will be lost when you close the page.</p>
        </div>
      )}
      {incomePast && (
        <div className="banner">
          <AlertCircle size={20} strokeWidth={2} aria-hidden />
          <div className="stack-sm grow">
            <p className="small">
              <strong>Did your money arrive?</strong> Your income date has passed. Update your balance and next income date to keep your plan right.
            </p>
            <div className="row">
              <button type="button" className="btn soft sm" onClick={ui.openBalance}>
                Update balance
              </button>
              <button type="button" className="btn ghost sm" onClick={ui.openIncome}>
                Set next income
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="stack-sm">
        <div className="seg" role="group" aria-label="Spending period">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="caption center">{fmtRange(summary.start, summary.end)}</p>
      </div>

      <SpendingCard s={summary} ui={ui} />

      <section className="hero" aria-labelledby="sts-label">
        <div className="between">
          {status.level ? (
            <span className={`status-pill ${status.level === 'attention' ? 'attention' : ''}`}>
              {status.level === 'comfortable' ? <CheckCircle2 size={16} strokeWidth={2} aria-hidden /> : <AlertTriangle size={16} strokeWidth={2} aria-hidden />}
              {status.label}
            </span>
          ) : (
            <span className="status-pill muted-pill">
              <CircleHelp size={16} strokeWidth={2} aria-hidden /> {status.label}
            </span>
          )}
          <button type="button" className="icon-btn on-purple" onClick={() => setHidden(!hidden)} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} aria-pressed={hidden}>
            {hidden ? <EyeOff size={20} strokeWidth={2} aria-hidden /> : <Eye size={20} strokeWidth={2} aria-hidden />}
          </button>
        </div>
        <div>
          <p className="sub" id="sts-label" style={{ fontWeight: 500 }}>
            Safe to spend today
          </p>
          {plan.ok ? (
            // Reveal sits beside the hidden amount, so nothing below shifts when amounts are hidden.
            <div className="hero-amount">
              <Amount value={hero} className="big" />
              {hidden && (
                <button type="button" className="btn on-hero sm" onClick={() => setHidden(false)}>
                  Reveal
                </button>
              )}
            </div>
          ) : (
            <p className="big" style={{ fontSize: 28 }}>
              Not available yet
            </p>
          )}
        </div>
        <p className="sub">
          {plan.ok
            ? plan.flexibleStartOfDay <= 0
              ? status.reason
              : plan.leftToday < 0
                ? `You’ve gone ${hidden ? 'over' : `${money(-plan.leftToday)} over`} today’s amount. The coming days get a little less.`
                : `Your even share of spending money through ${fmtDay(plan.horizonEnd!)}, after bills, ${plan.usesCard ? 'your card payment, ' : ''}savings, and your buffer.`
            : incomePast
              ? 'Update your next income date to see this.'
              : `Add ${[plan.missing.includes('balance') ? 'your balance' : null, plan.missing.includes('card') ? 'what you owe on your card' : null, plan.missing.includes('horizon') ? 'your next income date' : null].filter(Boolean).join(' and ')} to see this.`}
        </p>
        {status.level && status.level !== 'attention' && <p className="sub">{status.reason}</p>}
        {status.level === 'attention' && plan.flexibleStartOfDay > 0 && <p className="sub">{status.reason}</p>}
        {!status.level && plan.ok && <p className="sub">{status.reason}</p>}
        {plan.ok ? (
          <>
            <button type="button" className="hero-link" onClick={ui.openCalc}>
              How is this calculated?
            </button>
            <button type="button" className="btn on-hero block" onClick={ui.openCheck} style={{ minHeight: 52 }}>
              <ShoppingBag size={20} strokeWidth={2} aria-hidden /> Can I afford something?
            </button>
          </>
        ) : (
          <button type="button" className="btn on-hero sm" style={{ alignSelf: 'flex-start' }} onClick={plan.missing.includes('balance') ? ui.openBalance : plan.missing.includes('card') ? ui.openCard : ui.openIncome}>
            Add {plan.missing.includes('balance') ? 'your balance' : plan.missing.includes('card') ? 'your card details' : 'next income date'}
          </button>
        )}
      </section>

      <div className="tiles">
        <div className="tile">
          <span className="caption">{summary.remaining !== null && summary.remaining < 0 ? `Over plan ${noun}` : `Left ${noun}`}</span>
          {summary.remaining !== null ? <Amount value={Math.abs(summary.remaining)} className="value" /> : <span className="value">Not yet</span>}
          <span className="caption">
            {summary.remaining !== null ? `${summary.plannedDays} ${summary.plannedDays === 1 ? 'day' : 'days'} planned` : 'Needs your plan'}
          </span>
        </div>
        <button type="button" className="tile" onClick={ui.openIncome} style={{ font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
          <span className="caption">{plan.horizonSource === 'planUntil' ? 'Planning through' : 'Next income'}</span>
          <span className="value" style={{ fontSize: 18 }}>
            {state.income.nextDate ? fmtShort(state.income.nextDate) : state.income.planUntil ? fmtShort(state.income.planUntil) : 'Not set'}
          </span>
          <span className="caption">
            {state.income.nextDate && state.income.nextDate > today
              ? `In ${diffDays(today, state.income.nextDate)} days${state.income.dateSure ? '' : ', a guess'}`
              : state.income.planUntil
                ? 'No income date'
                : 'Tap to add'}
          </span>
        </button>
      </div>

      <PaceCard />

      <section className="stack-sm" aria-labelledby="recent-h">
        <div className="between">
          <h3 id="recent-h">Last purchases</h3>
          {state.txns.length > 0 && (
            <button type="button" className="link" onClick={() => ui.openActivity(null)}>
              See all
            </button>
          )}
        </div>
        {recent.length > 0 ? (
          <div className="card list">
            {recent.map((t) => (
              <TxnRow key={t.id} t={t} onOpen={() => ui.openTxn(t.id)} />
            ))}
          </div>
        ) : (
          <div className="card empty">
            <h3>Your spending starts here</h3>
            <p className="caption">Finfriend works without transactions. Add some to see pace and categories.</p>
            <div className="row">
              <button type="button" className="btn primary sm" onClick={() => ui.openTxn(null)}>
                Add expense
              </button>
              <button type="button" className="btn secondary sm" onClick={() => ui.openImport('screenshot')}>
                Import
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
