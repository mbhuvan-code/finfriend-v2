import { CreditCard } from 'lucide-react'
import { money } from '../../lib/money'
import type { BalanceCandidate } from '../../lib/parse'
import type { CardInfo } from '../../lib/types'
import { DateInput, Field, MoneyInput, Option } from '../../components/ui'

/** Credit card questions. Used in onboarding, the Bills tab, and the balance update sheet. */
export function CardFields({
  card,
  onChange,
  candidates = [],
  showErrors,
}: {
  card: CardInfo
  onChange: (c: CardInfo) => void
  candidates?: BalanceCandidate[]
  showErrors?: boolean
}) {
  const set = (patch: Partial<CardInfo>) => onChange({ ...card, ...patch })
  const remaining = card.payInFull === false && card.owed !== null && card.planPay !== null ? Math.max(0, card.owed - card.planPay) : null
  return (
    <div className="card stack">
      <div className="row">
        <span className="option-icon">
          <CreditCard size={22} strokeWidth={2} aria-hidden />
        </span>
        <div className="grow">
          <h3>Credit card</h3>
          <p className="caption">Card purchases are money you’ve already spent, so Finfriend sets aside what you’ll pay.</p>
        </div>
      </div>
      {candidates.length > 0 && (
        <div className="stack-sm">
          <span className="label">Found in your upload. Tap the one that shows what you owe:</span>
          <div className="chips">
            {candidates.map((b) => (
              <button key={b.amount + b.label} type="button" className="chip" aria-pressed={card.owed === b.amount} onClick={() => set({ owed: b.amount })}>
                {b.label}: {money(b.amount)}
              </button>
            ))}
          </div>
        </div>
      )}
      <Field
        label="How much do you owe on it right now?"
        htmlFor="card-owed"
        hint="Your card’s current balance. Not your credit limit or available credit."
        error={showErrors && card.owed === null ? 'Add what you owe. Use 0 if you’ve paid it off.' : null}
      >
        <MoneyInput id="card-owed" value={card.owed} onChange={(owed) => set({ owed })} />
      </Field>
      <Field label="When is the next payment due?" htmlFor="card-due" hint="Optional">
        <DateInput id="card-due" value={card.dueDate} onChange={(dueDate) => set({ dueDate })} />
      </Field>
      <div className="stack-sm">
        <span className="label">How do you usually pay it?</span>
        <div className="options" role="radiogroup" aria-label="How you pay your card">
          <Option checked={card.payInFull === true} onClick={() => set({ payInFull: true, planPay: null })} title="The full balance" desc="Finfriend sets aside everything you owe." />
          <Option checked={card.payInFull === false} onClick={() => set({ payInFull: false })} title="Part of it" desc="Finfriend sets aside the amount you plan to pay." />
        </div>
        {showErrors && card.payInFull === null && <span className="error-text">Choose how you usually pay it.</span>}
      </div>
      {card.payInFull === false && (
        <Field
          label="How much will you pay next time?"
          htmlFor="card-plan"
          hint={remaining !== null ? `The other ${money(remaining)} stays as card debt. It isn’t counted as spending money.` : 'At least the minimum payment.'}
          error={showErrors && card.planPay === null ? 'Add the amount you plan to pay.' : null}
        >
          <MoneyInput id="card-plan" value={card.planPay} onChange={(planPay) => set({ planPay })} />
        </Field>
      )}
    </div>
  )
}

export const cardComplete = (c: CardInfo) => c.owed !== null && c.payInFull !== null && (c.payInFull || c.planPay !== null)
