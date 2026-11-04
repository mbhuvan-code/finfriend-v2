import type { ReactNode } from 'react'
import type { Plan } from '../../lib/calc'
import { fmtRange, fmtShort } from '../../lib/dates'
import { HIDDEN, money } from '../../lib/money'
import { useStore } from '../../state/store'

/** Shows exactly how safe-to-spend is calculated from the user's own numbers. */
export function Breakdown({ plan: p, hiddenOverride }: { plan: Plan; hiddenOverride?: boolean }) {
  const { hidden: h, state } = useStore()
  const hidden = hiddenOverride ?? h
  const m = (n: number) => (hidden ? HIDDEN : money(n))
  const Line = ({ label, value, total, sign }: { label: ReactNode; value: number; total?: boolean; sign?: '+' | '−' | '=' | '÷' }) => (
    <div className={`line ${total ? 'total' : ''}`}>
      <span>
        {sign && sign !== '=' ? `${sign} ` : ''}
        {label}
      </span>
      <span className="num">{m(value)}</span>
    </div>
  )
  if (!p.ok) {
    return <p className="caption">Finfriend needs your balance and a next income or plan date to calculate this.</p>
  }
  const parts = p.cashParts
  const until = p.horizonSource === 'income' ? `before ${fmtShort(p.incomeDate!)}` : `by ${fmtShort(p.horizonEnd!)}`
  return (
    <div className="stack-sm">
      <div className="breakdown">
        <Line label={`Balance on ${fmtShort(state.balance.asOf!)}`} value={parts.balance} />
        {parts.pendingNotInBalance > 0 && <Line sign="−" label="Pending, not in balance yet" value={parts.pendingNotInBalance} />}
        {parts.incomeAfterBalance > 0 && <Line sign="+" label="Income you recorded since" value={parts.incomeAfterBalance} />}
        {parts.spendingAfterBalance > 0 && <Line sign="−" label="Spending you recorded since" value={parts.spendingAfterBalance} />}
        <Line total label="Cash now" value={p.cash} />
        <Line sign="−" label={`Bills due ${until} (${p.billsCounted.length})`} value={p.billsTotal} />
        {p.usesCard && (
          <Line sign="−" label={state.card.payInFull === false ? 'Next credit card payment' : 'Credit card you owe'} value={p.cardSetAside} />
        )}
        {p.protectedSavings > 0 && <Line sign="−" label="Savings you protected" value={p.protectedSavings} />}
        {p.buffer > 0 && <Line sign="−" label="Cash buffer" value={p.buffer} />}
        <Line total label="Spending money left" value={p.flexible} />
        {p.spentToday > 0 && <Line sign="+" label="Spent today, added back" value={p.spentToday} />}
        <div className="line">
          <span>
            ÷ {p.daysLeft} {p.daysLeft === 1 ? 'day' : 'days'} ({fmtRange(p.today, p.horizonEnd!)})
          </span>
          <span className="num">{m(p.dailyAmount)} a day</span>
        </div>
        {p.spentToday > 0 && <Line sign="−" label="Spent today" value={p.spentToday} />}
        <Line total label="Safe to spend today" value={Math.max(0, p.leftToday)} />
      </div>
      <p className="caption">Expected income is never counted until it arrives and you add it.</p>
      {p.usesCard && <p className="caption">Your credit limit is never counted as money you have.</p>}
      {p.cardRemaining > 0 && (
        <p className="caption">
          The other {m(p.cardRemaining)} you owe on your card stays as debt. It isn’t counted as spending money.
        </p>
      )}
      {p.billsUnknownAmount.length > 0 && (
        <p className="caption">Not included: {p.billsUnknownAmount.map((b) => b.label).join(', ')}, because the amount is unknown.</p>
      )}
      {p.billsLater.length > 0 && <p className="caption">Bills due after this date aren’t subtracted yet.</p>}
      {p.flexibleStartOfDay <= 0 && <p className="caption">Your bills, savings, and buffer are more than your cash, so there’s no spending money right now.</p>}
    </div>
  )
}
