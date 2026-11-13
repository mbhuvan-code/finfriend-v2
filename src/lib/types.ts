import type { ISODate } from './dates'

export type Kind = 'expense' | 'income'
export type Source = 'screenshot' | 'recording' | 'csv' | 'manual' | 'checker' | 'sample'

/** A confirmed transaction. Only transactions the user confirmed are ever stored. */
export interface Txn {
  id: string
  description: string
  date: ISODate
  amount: number // always positive; `kind` gives the direction
  kind: Kind
  category: string
  source: Source
  /**
   * true: the bank balance the user entered already reflects this transaction (history only).
   * false: it happened after that balance, so it changes the cash Finfriend works with.
   */
  inBalance: boolean
}

export interface Bill {
  id: string
  label: string
  amount: number | null // null = user marked the amount as unknown
  dueDate: ISODate | null // null = user is not sure when it is due
  paid: boolean
  amountUnknown?: boolean // user said "Not sure" about the amount
  dateUnknown?: boolean // user said "Not sure" about the due date
}

export type IncomePattern = 'weekly' | 'biweekly' | 'monthly' | 'irregular' | 'support' | 'other'

export interface IncomeInfo {
  pattern: IncomePattern | null
  /** Next expected income date. Never counted as available money. */
  nextDate: ISODate | null
  dateSure: boolean
  amountKind: 'exact' | 'range' | 'unknown' | null
  amount: number | null
  amountMax: number | null
  /** Used when there is no expected income date: how long current money needs to last. */
  planUntil: ISODate | null
}

export type PayMethod = 'debit' | 'credit' | 'both'

/** What the user owes on a credit card. The credit limit is never stored or counted. */
export interface CardInfo {
  owed: number | null // current card balance (what they owe)
  dueDate: ISODate | null
  /** true: pays the full balance. false: pays part of it. */
  payInFull: boolean | null
  /** For partial payers: how much they plan to pay next. This is what gets set aside. */
  planPay: number | null
}

export interface FinState {
  version: 2
  /** true while the app shows the built-in sample data for demos. Always labeled on screen. */
  demo?: boolean
  payMethod: PayMethod | null
  card: CardInfo
  onboarding: { complete: boolean; step: number; method: 'screenshot' | 'recording' | 'manual' | null }
  balance: { amount: number | null; asOf: ISODate | null; source: Source | null }
  /** Does the balance already reflect recent or pending spending? */
  pending: { answer: 'included' | 'notIncluded' | 'unsure' | null; amount: number | null }
  income: IncomeInfo
  bills: Bill[]
  billsAnswer: 'yes' | 'none' | null
  savings: { goalName: string; goalTarget: number | null; protect: number | null; skipped: boolean }
  buffer: { amount: number | null; skipped: boolean }
  txns: Txn[]
  settings: { hideAmounts: boolean; hideOnOpen: boolean; analyticsOff?: boolean }
}

export const usesCard = (s: Pick<FinState, 'payMethod'>) => s.payMethod === 'credit' || s.payMethod === 'both'

export const emptyState = (): FinState => ({
  version: 2,
  payMethod: null,
  card: { owed: null, dueDate: null, payInFull: null, planPay: null },
  onboarding: { complete: false, step: 0, method: null },
  balance: { amount: null, asOf: null, source: null },
  pending: { answer: null, amount: null },
  income: { pattern: null, nextDate: null, dateSure: true, amountKind: null, amount: null, amountMax: null, planUntil: null },
  bills: [],
  billsAnswer: null,
  savings: { goalName: '', goalTarget: null, protect: null, skipped: false },
  buffer: { amount: null, skipped: false },
  txns: [],
  settings: { hideAmounts: false, hideOnOpen: false },
})

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
