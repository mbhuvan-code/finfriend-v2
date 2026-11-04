// Sample data for demos only. It is loaded only when someone taps the demo button on the
// welcome screen, the app labels it as sample data on every screen, and one tap clears it.
// Dates are relative to today so every period view has something to show.

import { addDays, type ISODate } from './dates.ts'
import { emptyState, type FinState, type Txn } from './types.ts'

const SPENDING: [number, string, number, string][] = [
  [0, 'Caffe Strada', 5.25, 'coffee'],
  [0, 'Chipotle', 11.85, 'eating-out'],
  [-1, "Trader Joe's", 23.4, 'groceries'],
  [-2, 'BART', 4.4, 'transport'],
  [-2, 'Cal Student Store', 12.99, 'school'],
  [-3, 'Philz Coffee', 6.1, 'coffee'],
  [-4, 'Safeway', 18.75, 'groceries'],
  [-5, 'Target', 24.6, 'shopping'],
  [-6, 'Sweetgreen', 14.2, 'eating-out'],
  [-7, 'Lyft', 13.8, 'transport'],
  [-9, "Trader Joe's", 21.1, 'groceries'],
  [-10, 'Netflix', 7.99, 'subscriptions'],
  [-11, 'Boba Guys', 6.5, 'coffee'],
  [-12, 'AMC Theatres', 15.0, 'fun'],
  [-13, 'Uber Eats', 19.3, 'eating-out'],
]

export function sampleState(today: ISODate): FinState {
  const txns: Txn[] = SPENDING.map(([d, description, amount, category], i) => ({
    id: `sample-${i}`,
    description,
    date: addDays(today, d),
    amount,
    kind: 'expense',
    category,
    source: 'sample',
    inBalance: true,
  }))
  txns.push({ id: 'sample-pay', description: 'Campus Job Payroll', date: addDays(today, -8), amount: 410, kind: 'income', category: 'paycheck', source: 'sample', inBalance: true })

  return {
    ...emptyState(),
    demo: true,
    onboarding: { complete: true, step: 7, method: null },
    payMethod: 'both',
    card: { owed: 85.4, dueDate: addDays(today, 12), payInFull: true, planPay: null },
    balance: { amount: 742.5, asOf: today, source: 'sample' },
    pending: { answer: 'included', amount: null },
    income: { pattern: 'biweekly', nextDate: addDays(today, 6), dateSure: true, amountKind: 'exact', amount: 410, amountMax: null, planUntil: null },
    billsAnswer: 'yes',
    bills: [
      { id: 'sample-rent', label: 'Rent', amount: 350, dueDate: addDays(today, 3), paid: false },
      { id: 'sample-phone', label: 'Phone', amount: 45, dueDate: addDays(today, 5), paid: false },
      { id: 'sample-spotify', label: 'Spotify', amount: 5.99, dueDate: addDays(today, 9), paid: false },
    ],
    savings: { goalName: 'Spring trip', goalTarget: 300, protect: 60, skipped: false },
    buffer: { amount: 50, skipped: false },
    txns,
  }
}
