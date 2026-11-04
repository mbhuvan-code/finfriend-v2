import { useState } from 'react'
import { CreditCard, FileSpreadsheet, Film, ImageIcon, Landmark, Layers, ShieldCheck } from 'lucide-react'
import { fmtShort } from '../../lib/dates'
import { usesCard, type CardInfo, type FinState, type PayMethod, type Source } from '../../lib/types'
import { useStore } from '../../state/store'
import { Field, MoneyInput, Notice, Option } from '../../components/ui'
import { Importer, type ImportMode } from '../import/Importer'
import { BalanceReview, invalidIncluded, RowsReview } from '../import/Review'
import { CardFields } from './CardFields'
import { Footer } from './Footer'
import { draftToTxn, usePool } from './pool'

export { draftToTxn, txnToDraft } from './pool'

/** An upload panel that opens in place, so each step offers its own upload. */
export function InlineUpload({ modes, label, onDone }: { modes: ImportMode[]; label: string; onDone?: (newRows: number) => void }) {
  const { today } = useStore()
  const pool = usePool()
  const [mode, setMode] = useState<ImportMode | null>(null)
  if (!mode) {
    return (
      <div className="stack-sm">
        <span className="label">{label}</span>
        <div className="chips">
          {modes.includes('screenshot') && (
            <button type="button" className="chip" onClick={() => setMode('screenshot')}>
              <ImageIcon size={16} strokeWidth={2} aria-hidden /> Screenshot(s)
            </button>
          )}
          {modes.includes('recording') && (
            <button type="button" className="chip" onClick={() => setMode('recording')}>
              <Film size={16} strokeWidth={2} aria-hidden /> Screen recording
            </button>
          )}
          {modes.includes('csv') && (
            <button type="button" className="chip" onClick={() => setMode('csv')}>
              <FileSpreadsheet size={16} strokeWidth={2} aria-hidden /> CSV
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="stack">
      <Importer
        key={mode}
        mode={mode}
        today={today}
        onDone={(r) => {
          const n = pool.add(r)
          setMode(null)
          onDone?.(n)
        }}
        onSwitch={(to) => setMode(to === 'manual' ? null : to)}
      />
      <button type="button" className="btn ghost" onClick={() => setMode(null)}>
        Cancel upload
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ 4. Balance

export function BalanceStep({ next }: { next: () => void }) {
  const { state, update, today } = useStore()
  const pool = usePool()
  const [balance, setBalance] = useState<number | null>(state.balance.amount)
  const [asOf, setAsOf] = useState(state.balance.asOf ?? today)
  const [foundRows, setFoundRows] = useState(0)
  const pending = state.pending
  const setPending = (p: Partial<FinState['pending']>) => update((s) => ({ ...s, pending: { ...s.pending, ...p } }))

  function save() {
    const picked = pool.balances.find((b) => b.amount === balance)
    const source: Source | null = balance === null ? null : picked ? (/^\d+:\d\d$/.test(picked.origin) ? 'recording' : 'screenshot') : 'manual'
    update((s) => ({ ...s, balance: { amount: balance, asOf: balance === null ? null : asOf, source } }))
    next()
  }

  return (
    <>
      <div className="stack-sm">
        <h1>How much is in your account?</h1>
        <p className="muted">Type it in or upload a screenshot from your banking app. An approximate number is fine.</p>
      </div>
      <BalanceReview
        balances={pool.balances}
        balance={balance}
        setBalance={setBalance}
        asOf={asOf}
        setAsOf={setAsOf}
        today={today}
        title="Bank account balance"
        sub="The money you can use right now. If you use a credit card, don’t count your credit limit."
      />
      <InlineUpload modes={['screenshot']} label="Or find it in a screenshot" onDone={setFoundRows} />
      {foundRows > 0 && (
        <Notice>
          That upload also had {foundRows} {foundRows === 1 ? 'transaction' : 'transactions'}. You’ll review {foundRows === 1 ? 'it' : 'them'} in a later step, so you don’t need to upload again.
        </Notice>
      )}
      <div className="card stack">
        <div className="stack-sm">
          <h3>Does this balance include your recent spending?</h3>
          <p className="caption">Purchases can take a day or two to show up. This keeps them from being counted twice or missed.</p>
        </div>
        <div className="options" role="radiogroup" aria-label="Pending spending">
          <Option checked={pending.answer === 'included'} onClick={() => setPending({ answer: 'included', amount: null })} title="Yes, it’s up to date" />
          <Option checked={pending.answer === 'notIncluded'} onClick={() => setPending({ answer: 'notIncluded' })} title="No, some purchases haven’t shown up yet" />
          <Option checked={pending.answer === 'unsure'} onClick={() => setPending({ answer: 'unsure', amount: null })} title="I’m not sure" />
        </div>
        {pending.answer === 'notIncluded' && (
          <Field label="About how much is still pending?" htmlFor="pending-amt" hint="Finfriend subtracts this from your balance.">
            <MoneyInput id="pending-amt" value={pending.amount} onChange={(amount) => setPending({ amount })} />
          </Field>
        )}
        {pending.answer === 'unsure' && <p className="caption">Finfriend will use your balance as is. If purchases are still pending, your estimate may run a little high.</p>}
      </div>
      {balance === null && pool.balances.length === 0 && <Notice>Finfriend needs a balance to estimate what’s safe to spend. You can continue and add it later.</Notice>}
      <Footer label="Continue" onClick={save} />
    </>
  )
}

// ------------------------------------------------------------------ 6. Debit or credit, then transactions

export function PayTxnStep({ next }: { next: () => void }) {
  const { state, update, today } = useStore()
  const pool = usePool()
  const pm = state.payMethod
  const card = usesCard(state)
  const [cardInfo, setCardInfo] = useState<CardInfo>(state.card)
  const [showErrors, setShowErrors] = useState(false)
  const setPm = (payMethod: PayMethod) => update((s) => ({ ...s, payMethod }))
  const rows = pool.rows
  const included = rows.filter((r) => r.include).length
  const bad = invalidIncluded(rows, today)

  function save() {
    if (bad.length > 0) return setShowErrors(true)
    const asOf = state.balance.amount === null ? null : state.balance.asOf
    update((s) => ({
      ...s,
      card: card ? cardInfo : s.card,
      txns: rows.filter((r) => r.include).map((d) => draftToTxn(d, asOf)),
    }))
    next()
  }

  return (
    <>
      <div className="stack-sm">
        <h1>How do you pay for things?</h1>
        <p className="muted">Credit cards work differently, so Finfriend asks a little more if you use one.</p>
      </div>
      <div className="options" role="radiogroup" aria-label="How you usually pay">
        <Option checked={pm === 'debit'} onClick={() => setPm('debit')} icon={<Landmark size={22} strokeWidth={2} aria-hidden />} title="Debit card or cash" desc="Money comes straight out of your bank account." />
        <Option checked={pm === 'credit'} onClick={() => setPm('credit')} icon={<CreditCard size={22} strokeWidth={2} aria-hidden />} title="Credit card" desc="You pay the card bill later from your bank account." />
        <Option checked={pm === 'both'} onClick={() => setPm('both')} icon={<Layers size={22} strokeWidth={2} aria-hidden />} title="Both" desc="Some purchases on debit, some on credit." />
      </div>

      {card && (
        <>
          <Notice icon={<ShieldCheck size={20} strokeWidth={2} aria-hidden />}>
            Your credit limit is never counted as money you have. Finfriend only plans with money in your bank account.
          </Notice>
          <CardFields
            card={cardInfo}
            onChange={setCardInfo}
            // Only amounts that could be a card balance. Bank "available balance" lines and the
            // amount already used as the bank balance are left out.
            candidates={pool.balances.filter((b) => b.amount !== state.balance.amount && !/available/i.test(b.label))}
          />
          {state.balance.asOf && <p className="caption">Use what you owe as of {fmtShort(state.balance.asOf)}, the same day as your bank balance.</p>}
        </>
      )}

      {pm && (
        <>
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <h2>Recent transactions</h2>
            <p className="muted">
              Optional. {card ? 'Add purchases from your bank and your card. ' : ''}They show where your money goes and whether your spending is on pace.
            </p>
          </div>
          <RowsReview rows={rows} setRows={pool.setRows} today={today} showErrors={showErrors} notes={pool.notes} warnings={pool.warnings} />
          {rows.length === 0 && <p className="caption">No transactions yet. That’s okay. Your safe-to-spend works without them.</p>}
          <InlineUpload modes={['screenshot', 'recording', 'csv']} label="Add from a file" />
          {showErrors && bad.length > 0 && (
            <Notice tone="alert">
              {bad.length} included {bad.length === 1 ? 'row needs' : 'rows need'} a name, amount, or date. Fix {bad.length === 1 ? 'it' : 'them'} or uncheck {bad.length === 1 ? 'it' : 'them'}.
            </Notice>
          )}
        </>
      )}
      <Footer
        label={included > 0 ? `Save ${included} ${included === 1 ? 'transaction' : 'transactions'} and continue` : 'Continue'}
        onClick={save}
        disabled={!pm}
      />
    </>
  )
}
