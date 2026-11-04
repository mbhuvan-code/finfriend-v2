// Every number on the dashboard comes from this file. Each function only uses what the
// user entered or confirmed. When an input is missing, the result says so instead of guessing.

import { addDays, diffDays, endOfMonth, fmtShort, maxDate, minDate, startOfMonth, startOfWeek, type ISODate } from './dates.ts'
import { money, round2, sum } from './money.ts'
import { usesCard, type Bill, type FinState, type Txn } from './types.ts'

export type Missing = 'balance' | 'horizon' | 'horizonPast' | 'card'

export interface CashParts {
  balance: number
  pendingNotInBalance: number
  incomeAfterBalance: number
  spendingAfterBalance: number
}

export interface Plan {
  ok: boolean
  missing: Missing[]
  today: ISODate
  cash: number
  cashParts: CashParts
  /** Last day current money needs to cover. The day before next income, or the plan-until date. */
  horizonEnd: ISODate | null
  horizonSource: 'income' | 'planUntil' | null
  incomeDate: ISODate | null
  /** Days from today through horizonEnd, inclusive. */
  daysLeft: number
  billsCounted: Bill[]
  billsTotal: number
  billsUnknownAmount: Bill[]
  billsOverdue: Bill[]
  billsLater: Bill[]
  /** Credit card: what the user owes, what is set aside now, and debt left after that payment. */
  usesCard: boolean
  cardOwed: number
  cardSetAside: number
  cardRemaining: number
  protectedSavings: number
  buffer: number
  /** Money for everyday spending until the horizon, after today's purchases. */
  flexible: number
  /** Same, as it stood at the start of today (today's spending added back). */
  flexibleStartOfDay: number
  spentToday: number
  /** Even share per day: flexibleStartOfDay / daysLeft. */
  dailyAmount: number
  leftToday: number
  shortfall: number
}

export function cashParts(s: FinState): CashParts {
  const after = s.txns.filter((t) => !t.inBalance)
  return {
    balance: s.balance.amount ?? 0,
    pendingNotInBalance: s.pending.answer === 'notIncluded' ? s.pending.amount ?? 0 : 0,
    incomeAfterBalance: sum(after.filter((t) => t.kind === 'income').map((t) => t.amount)),
    spendingAfterBalance: sum(after.filter((t) => t.kind === 'expense').map((t) => t.amount)),
  }
}

export function horizon(s: FinState, today: ISODate): { end: ISODate | null; source: Plan['horizonSource']; past: boolean } {
  const next = s.income.nextDate
  if (next) {
    // Money is needed through the day before income arrives.
    if (next <= today) return { end: null, source: 'income', past: true }
    return { end: addDays(next, -1), source: 'income', past: false }
  }
  const until = s.income.planUntil
  if (until) {
    if (until < today) return { end: null, source: 'planUntil', past: true }
    return { end: until, source: 'planUntil', past: false }
  }
  return { end: null, source: null, past: false }
}

export function computePlan(s: FinState, today: ISODate): Plan {
  const missing: Missing[] = []
  if (s.balance.amount === null) missing.push('balance')
  const h = horizon(s, today)
  if (h.past) missing.push('horizonPast')
  else if (!h.end) missing.push('horizon')
  const card = usesCard(s)
  if (card && (s.card.owed === null || s.card.payInFull === null || (s.card.payInFull === false && s.card.planPay === null))) missing.push('card')

  const parts = cashParts(s)
  const cash = round2(parts.balance - parts.pendingNotInBalance + parts.incomeAfterBalance - parts.spendingAfterBalance)

  const unpaid = s.bills.filter((b) => !b.paid)
  // A bill counts if it is due on or before the next income day. Bills with no due date count too,
  // because Finfriend can't tell they will wait. Overdue bills always count.
  const countsNow = (b: Bill) => !b.dueDate || !h.end || b.dueDate <= addDays(h.end, 1)
  const billsCounted = unpaid.filter(countsNow)
  const billsLater = unpaid.filter((b) => !countsNow(b))
  const billsTotal = sum(billsCounted.map((b) => b.amount ?? 0))
  const billsUnknownAmount = billsCounted.filter((b) => b.amount === null)
  const billsOverdue = unpaid.filter((b) => b.dueDate !== null && b.dueDate < today)

  const protectedSavings = s.savings.skipped ? 0 : s.savings.protect ?? 0
  const buffer = s.buffer.skipped ? 0 : s.buffer.amount ?? 0

  // Card purchases are already spent money. Finfriend sets aside the payment the user will make:
  // the full balance if they pay in full, otherwise the amount they plan to pay. Available credit
  // is never treated as money they have.
  const cardOwed = card ? s.card.owed ?? 0 : 0
  const cardSetAside = !card ? 0 : s.card.payInFull === false ? Math.min(cardOwed, s.card.planPay ?? 0) : cardOwed
  const cardRemaining = round2(cardOwed - cardSetAside)

  const flexible = round2(cash - billsTotal - cardSetAside - protectedSavings - buffer)
  const spentToday = sum(s.txns.filter((t) => t.kind === 'expense' && t.date === today).map((t) => t.amount))
  const flexibleStartOfDay = round2(flexible + spentToday)
  const daysLeft = h.end ? diffDays(today, h.end) + 1 : 0

  const ok = missing.length === 0 && daysLeft > 0
  const dailyAmount = ok ? round2(Math.max(0, flexibleStartOfDay) / daysLeft) : 0
  const leftToday = ok ? round2(dailyAmount - spentToday) : 0

  return {
    ok,
    missing,
    today,
    cash,
    cashParts: parts,
    horizonEnd: h.end,
    horizonSource: h.source,
    incomeDate: s.income.nextDate,
    daysLeft,
    billsCounted,
    billsTotal,
    billsUnknownAmount,
    billsOverdue,
    billsLater,
    usesCard: card,
    cardOwed,
    cardSetAside,
    cardRemaining,
    protectedSavings,
    buffer,
    flexible,
    flexibleStartOfDay,
    spentToday,
    dailyAmount,
    leftToday,
    shortfall: flexibleStartOfDay < 0 ? round2(-flexibleStartOfDay) : 0,
  }
}

/** The amount shown as "Safe to spend today". Never negative. */
export const safeToday = (p: Plan) => Math.max(0, p.leftToday)

// ---------------------------------------------------------------- status

export type StatusLevel = 'comfortable' | 'tight' | 'attention'

export interface Status {
  level: StatusLevel | null // null = not enough information to judge
  label: string
  reason: string
}

export function computeStatus(p: Plan, pace: Pace | null): Status {
  if (!p.ok) return { level: null, label: 'Not enough info yet', reason: 'Add the missing details to see your status.' }
  if (p.flexibleStartOfDay <= 0) {
    return {
      level: 'attention',
      label: 'Needs attention',
      reason: `Your ${p.usesCard ? 'bills, card payment' : 'bills'}, savings, and buffer are ${money(p.shortfall)} more than your cash right now.`,
    }
  }
  if (p.billsOverdue.length > 0) {
    const b = p.billsOverdue[0]
    return {
      level: 'attention',
      label: 'Needs attention',
      reason: `${b.label} was due ${fmtShort(b.dueDate!)}. Mark it paid if you've already paid it.`,
    }
  }
  if (p.billsUnknownAmount.length > 0) {
    const names = p.billsUnknownAmount.map((b) => b.label).join(', ')
    return { level: null, label: 'Status on hold', reason: `Add the amount for ${names} so Finfriend can judge your status.` }
  }
  if (p.leftToday < 0) {
    return { level: 'tight', label: 'Tight', reason: `You're ${money(-p.leftToday)} over today's amount, so the coming days get a little less.` }
  }
  if (pace && pace.state === 'above') {
    return { level: 'tight', label: 'Tight', reason: pace.headline }
  }
  return {
    level: 'comfortable',
    label: 'Comfortable',
    reason: `Your ${p.usesCard ? 'bills, card payment' : 'bills'}, savings, and buffer are covered, and you are within today’s amount.`,
  }
}

// ---------------------------------------------------------------- periods

export type PeriodId = 'today' | 'week' | '2weeks' | 'month'

export const PERIODS: { id: PeriodId; label: string; noun: string }[] = [
  { id: 'today', label: 'Today', noun: 'today' },
  { id: 'week', label: 'Week', noun: 'this week' },
  { id: '2weeks', label: '2 Weeks', noun: 'these 2 weeks' },
  { id: 'month', label: 'Month', noun: 'this month' },
]

export function periodRange(id: PeriodId, today: ISODate): { start: ISODate; end: ISODate } {
  switch (id) {
    case 'today':
      return { start: today, end: today }
    case 'week': {
      const start = startOfWeek(today)
      return { start, end: addDays(start, 6) }
    }
    case '2weeks': {
      const start = startOfWeek(today)
      return { start, end: addDays(start, 13) }
    }
    case 'month':
      return { start: startOfMonth(today), end: endOfMonth(today) }
  }
}

export interface CategoryTotal {
  category: string
  amount: number
  count: number
}

export interface PeriodSummary {
  id: PeriodId
  start: ISODate
  end: ISODate
  /** Part of the period with transaction history (null if there is none). */
  historyStart: ISODate | null
  historyPartial: boolean
  spent: number
  income: number
  byCategory: CategoryTotal[]
  /** Planned spending money for the rest of this period, from today. Null when there is no plan. */
  remaining: number | null
  /** Days of this period, from today, that the plan covers. */
  plannedDays: number
  /** Days of this period after the next income, which the plan can't speak for yet. */
  uncoveredFrom: ISODate | null
  billsDueInPeriod: Bill[]
}

export function earliestTxnDate(txns: Txn[]): ISODate | null {
  if (txns.length === 0) return null
  return txns.reduce((m, t) => (t.date < m ? t.date : m), txns[0].date)
}

export function summarizePeriod(s: FinState, p: Plan, id: PeriodId): PeriodSummary {
  const { start, end } = periodRange(id, p.today)
  const coverage = earliestTxnDate(s.txns)
  const historyStart = coverage && coverage <= p.today ? maxDate(start, coverage) : null
  const inRange = (t: Txn) => t.date >= start && t.date <= minDate(end, p.today)
  const txns = s.txns.filter(inRange)
  const spending = txns.filter((t) => t.kind === 'expense')

  const map = new Map<string, CategoryTotal>()
  for (const t of spending) {
    const c = map.get(t.category) ?? { category: t.category, amount: 0, count: 0 }
    c.amount = round2(c.amount + t.amount)
    c.count++
    map.set(t.category, c)
  }
  const byCategory = [...map.values()].sort((a, b) => b.amount - a.amount)

  let remaining: number | null = null
  let plannedDays = 0
  let uncoveredFrom: ISODate | null = null
  if (p.ok && p.horizonEnd) {
    const lastPlanned = minDate(end, p.horizonEnd)
    plannedDays = Math.max(0, diffDays(p.today, lastPlanned) + 1)
    remaining = round2(p.dailyAmount * plannedDays - p.spentToday)
    if (end > p.horizonEnd) uncoveredFrom = addDays(p.horizonEnd, 1)
  }

  const billsDueInPeriod = s.bills.filter((b) => !b.paid && b.dueDate && b.dueDate >= p.today && b.dueDate <= end)

  return {
    id,
    start,
    end,
    historyStart,
    historyPartial: !!historyStart && historyStart > start,
    spent: sum(spending.map((t) => t.amount)),
    income: sum(txns.filter((t) => t.kind === 'income').map((t) => t.amount)),
    byCategory,
    remaining,
    plannedDays,
    uncoveredFrom,
    billsDueInPeriod,
  }
}

// ---------------------------------------------------------------- pace

export interface Pace {
  state: 'above' | 'on' | 'below'
  headline: string
  detail: string
  /** Average spent per day over the completed days of the period that have history. */
  pastDailyAverage: number
  completeDays: number
  /** 0..1 position of past average relative to 2x the daily amount, for the gauge. */
  gauge: number
}

/**
 * Compares how fast the user has spent in this period with the daily amount their plan allows.
 * Needs a plan and at least one complete day of history inside the period.
 */
export function computePace(s: FinState, p: Plan, period: PeriodSummary): Pace | null {
  if (!p.ok) return null

  if (period.id === 'today') {
    if (p.dailyAmount <= 0) return null
    const used = p.spentToday
    const ratio = used / p.dailyAmount
    const state = ratio > 1 ? 'above' : ratio >= 0.9 ? 'on' : 'below'
    const headline =
      state === 'above'
        ? `You've spent ${money(used)} today, ${money(used - p.dailyAmount)} over today's amount.`
        : `You've used ${money(used)} of today's ${money(p.dailyAmount)}.`
    return {
      state,
      headline,
      detail: `Today's amount spreads your spending money evenly across ${p.daysLeft} days.`,
      pastDailyAverage: used,
      completeDays: 0,
      gauge: Math.min(1, ratio / 2),
    }
  }

  if (!period.historyStart) return null
  const completeDays = diffDays(period.historyStart, p.today) // days before today with history
  if (completeDays < 1) return null
  const spentBeforeToday = sum(
    s.txns
      .filter((t) => t.kind === 'expense' && t.date >= period.historyStart! && t.date < p.today)
      .map((t) => t.amount),
  )
  const avg = round2(spentBeforeToday / completeDays)
  const target = p.dailyAmount
  const since = fmtShort(period.historyStart)

  if (target <= 0) {
    return {
      state: 'above',
      headline: `You've averaged ${money(avg)} a day since ${since}, and there's no spending money left in your plan.`,
      detail: 'Your bills, savings, and buffer use up your current cash.',
      pastDailyAverage: avg,
      completeDays,
      gauge: 1,
    }
  }

  const ratio = avg / target
  const state: Pace['state'] = ratio > 1.1 ? 'above' : ratio < 0.9 ? 'below' : 'on'
  const until = p.horizonSource === 'income' ? `until ${fmtShort(p.incomeDate!)}` : `through ${fmtShort(p.horizonEnd!)}`
  const headline =
    state === 'above'
      ? `You're spending faster than your plan. You've averaged ${money(avg)} a day since ${since}.`
      : state === 'below'
        ? `You're spending slower than your plan. You've averaged ${money(avg)} a day since ${since}.`
        : `You're right on pace. You've averaged ${money(avg)} a day since ${since}.`
  return {
    state,
    headline,
    detail: `Your plan allows ${money(target)} a day ${until}.`,
    pastDailyAverage: avg,
    completeDays,
    gauge: Math.min(1, ratio / 2),
  }
}

// ---------------------------------------------------------------- purchase check

export type Verdict = 'fitsToday' | 'fitsLater' | 'dipsProtected' | 'risksBills' | 'overBalance' | 'unknown'

export interface PurchaseCheck {
  verdict: Verdict
  title: string
  lines: string[]
  /** Daily amount for the days after today if the purchase happens. */
  newDaily: number | null
  leftTodayAfter: number | null
  weekRemainingBefore: number | null
  weekRemainingAfter: number | null
}

export function checkPurchase(p: Plan, week: PeriodSummary | null, price: number): PurchaseCheck {
  const empty = { newDaily: null, leftTodayAfter: null, weekRemainingBefore: null, weekRemainingAfter: null }
  if (!p.ok) {
    return {
      verdict: 'unknown',
      title: 'Finfriend needs a little more info',
      lines: ['Add your balance and your next income date so Finfriend can check purchases.'],
      ...empty,
    }
  }
  const lines: string[] = []
  const flexibleNow = p.flexible // after today's spending
  const restDays = p.daysLeft - 1
  const leftTodayAfter = round2(p.leftToday - price)
  const flexAfter = round2(flexibleNow - price)
  const newDaily = restDays > 0 ? round2(Math.max(0, flexAfter) / restDays) : null
  const weekBefore = week?.remaining ?? null
  const weekAfter = weekBefore === null ? null : round2(weekBefore - price)
  const untilText = p.horizonSource === 'income' ? `until your income on ${fmtShort(p.incomeDate!)}` : `through ${fmtShort(p.horizonEnd!)}`
  const unknownNote =
    p.billsUnknownAmount.length > 0
      ? `This doesn't include ${p.billsUnknownAmount.map((b) => b.label).join(', ')}, because the amount is unknown.`
      : null

  const owedSoon = round2(p.billsTotal + p.cardSetAside)
  const owedName = p.usesCard ? 'bills and card payment' : 'bills'
  let verdict: Verdict
  let title: string

  if (price <= Math.max(0, p.leftToday)) {
    verdict = 'fitsToday'
    title = "This fits today's amount"
    lines.push(`You'd have ${money(leftTodayAfter)} left for today.`)
    lines.push(`Your daily amount stays ${money(p.dailyAmount)} ${untilText}.`)
  } else if (price <= flexibleNow) {
    verdict = 'fitsLater'
    title = 'This fits if you spend less later'
    lines.push(`It's ${money(price - Math.max(0, p.leftToday))} more than what's left for today.`)
    if (newDaily !== null) {
      lines.push(`Your daily amount would drop from ${money(p.dailyAmount)} to ${money(newDaily)} for the next ${restDays} ${restDays === 1 ? 'day' : 'days'}.`)
    }
    lines.push(`Your ${owedName}, savings, and buffer stay covered.`)
  } else if (price <= flexibleNow + p.buffer + p.protectedSavings && price <= p.cash - owedSoon) {
    verdict = 'dipsProtected'
    title = 'This would use money you set aside'
    const dip = round2(price - Math.max(0, flexibleNow))
    const parts = [p.buffer > 0 ? 'buffer' : null, p.protectedSavings > 0 ? 'savings' : null].filter(Boolean).join(' and ')
    lines.push(`It would take ${money(dip)} from your ${parts}.`)
    lines.push(`You'd have no spending money left ${untilText}.`)
    lines.push(`Your known ${owedName} would still be covered.`)
  } else if (price <= p.cash) {
    verdict = 'risksBills'
    title = `This puts your upcoming ${owedName} at risk`
    lines.push(`You have ${money(p.cash)} in cash and ${money(owedSoon)} set aside for ${owedName}.`)
    lines.push(`After this purchase, you'd be ${money(price - (p.cash - owedSoon))} short for those.`)
  } else {
    verdict = 'overBalance'
    title = 'This is more than your cash'
    lines.push(`It's ${money(price - p.cash)} more than the ${money(p.cash)} Finfriend has for you.`)
  }

  if (weekBefore !== null && weekAfter !== null && verdict !== 'overBalance') {
    lines.push(`Left this week would go from ${money(weekBefore)} to ${money(weekAfter)}.`)
  }
  if (unknownNote) lines.push(unknownNote)
  if (p.usesCard) lines.push('Putting it on your card gives the same answer. You’d pay it off from this money.')

  return { verdict, title, lines, newDaily, leftTodayAfter, weekRemainingBefore: weekBefore, weekRemainingAfter: weekAfter }
}

// ---------------------------------------------------------------- readiness for onboarding summary

export interface MissingItem {
  key: string
  text: string
  step: number
}

export function missingEssentials(s: FinState, today: ISODate): MissingItem[] {
  const out: MissingItem[] = []
  if (s.balance.amount === null) out.push({ key: 'balance', text: 'Your bank account balance', step: 3 })
  if (usesCard(s) && (s.card.owed === null || s.card.payInFull === null || (s.card.payInFull === false && s.card.planPay === null)))
    out.push({ key: 'card', text: 'What you owe on your credit card and how you pay it', step: 5 })
  const h = horizon(s, today)
  if (h.past) out.push({ key: 'horizonPast', text: 'An income or plan date that is still ahead', step: 1 })
  else if (!h.end) out.push({ key: 'horizon', text: 'Your next income date, or how long your money needs to last', step: 1 })
  return out
}
