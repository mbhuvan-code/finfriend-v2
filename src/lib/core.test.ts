// Run with: npm test
// Test inputs below are fixtures for the math, never shown in the app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPurchase, computePace, computePlan, computeStatus, summarizePeriod } from './calc.ts'
import { csvToDrafts, guessMapping, parseCSV } from './csv.ts'
import { mergeFrames } from './merge.ts'
import { findMoney, parseLines, type OcrLine } from './parse.ts'
import { emptyState, type FinState, type Txn } from './types.ts'

const TODAY = '2026-11-04' // a Wednesday

function base(): FinState {
  const s = emptyState()
  s.balance = { amount: 500, asOf: TODAY, source: 'manual' }
  s.income = { ...s.income, pattern: 'biweekly', nextDate: '2026-11-14' }
  return s
}
const txn = (p: Partial<Txn>): Txn => ({
  id: Math.random().toString(36), description: 'x', date: TODAY, amount: 10, kind: 'expense',
  category: 'other', source: 'manual', inBalance: true, ...p,
})

test('new state has no financial values', () => {
  const s = emptyState()
  assert.equal(s.balance.amount, null)
  assert.equal(s.txns.length, 0)
  assert.equal(s.bills.length, 0)
  const p = computePlan(s, TODAY)
  assert.equal(p.ok, false)
  assert.deepEqual(p.missing, ['balance', 'horizon'])
  assert.equal(computeStatus(p, null).level, null)
})

test('safe to spend subtracts bills, savings, buffer before dividing by days', () => {
  const s = base()
  s.bills = [
    { id: 'b1', label: 'Phone', amount: 60, dueDate: '2026-11-10', paid: false },
    { id: 'b2', label: 'Rent', amount: 400, dueDate: '2026-12-01', paid: false }, // after income: not counted
  ]
  s.savings = { goalName: 'Trip', goalTarget: 300, protect: 40, skipped: false }
  s.buffer = { amount: 50, skipped: false }
  const p = computePlan(s, TODAY)
  assert.equal(p.ok, true)
  assert.equal(p.horizonEnd, '2026-11-13')
  assert.equal(p.daysLeft, 10)
  assert.equal(p.billsTotal, 60)
  assert.equal(p.billsLater.length, 1)
  assert.equal(p.flexible, 350) // 500 - 60 - 40 - 50
  assert.equal(p.dailyAmount, 35)
  assert.equal(p.leftToday, 35)
})

test('today spending recorded after the balance lowers cash but keeps the daily amount stable', () => {
  const s = base()
  s.txns = [txn({ amount: 20, inBalance: false })]
  const p = computePlan(s, TODAY)
  assert.equal(p.cash, 480)
  assert.equal(p.dailyAmount, 50) // (480 + 20) / 10
  assert.equal(p.leftToday, 30)
})

test('pending spending not yet in the balance is subtracted', () => {
  const s = base()
  s.pending = { answer: 'notIncluded', amount: 25 }
  assert.equal(computePlan(s, TODAY).cash, 475)
})

test('shortfall gives Needs attention and zero safe to spend', () => {
  const s = base()
  s.bills = [{ id: 'b', label: 'Rent', amount: 700, dueDate: '2026-11-05', paid: false }]
  const p = computePlan(s, TODAY)
  assert.equal(p.dailyAmount, 0)
  const st = computeStatus(p, null)
  assert.equal(st.level, 'attention')
  assert.match(st.reason, /\$200\.00/)
})

test('unknown bill amount withholds Comfortable', () => {
  const s = base()
  s.bills = [{ id: 'b', label: 'Electric', amount: null, dueDate: '2026-11-08', paid: false }]
  const p = computePlan(s, TODAY)
  assert.equal(computeStatus(p, null).level, null)
})

test('irregular income uses plan-until date and never counts future income', () => {
  const s = base()
  s.income = { ...s.income, pattern: 'irregular', nextDate: null, planUntil: '2026-11-08', amount: 900, amountKind: 'range' }
  const p = computePlan(s, TODAY)
  assert.equal(p.daysLeft, 5)
  assert.equal(p.dailyAmount, 100)
  assert.equal(p.cash, 500)
})

test('income date in the past asks for an update', () => {
  const s = base()
  s.income.nextDate = '2026-11-01'
  const p = computePlan(s, TODAY)
  assert.equal(p.ok, false)
  assert.deepEqual(p.missing, ['horizonPast'])
})

test('week donut parts reconcile: spent + remaining, no double counting', () => {
  const s = base()
  s.txns = [
    txn({ date: '2026-11-02', amount: 30, category: 'groceries' }),
    txn({ date: '2026-11-03', amount: 10, category: 'coffee' }),
    txn({ date: '2026-10-28', amount: 99, category: 'shopping' }), // last week
  ]
  const p = computePlan(s, TODAY)
  const w = summarizePeriod(s, p, 'week')
  assert.equal(w.start, '2026-11-02')
  assert.equal(w.end, '2026-11-08')
  assert.equal(w.spent, 40)
  assert.equal(w.plannedDays, 5) // Wed to Sun
  assert.equal(w.remaining, 250) // 50/day * 5
  assert.equal(w.historyPartial, false)
  const pace = computePace(s, p, w)!
  assert.equal(pace.completeDays, 2)
  assert.equal(pace.pastDailyAverage, 20)
  assert.equal(pace.state, 'below')
})

test('month view notes days after next income are not planned', () => {
  const s = base()
  const p = computePlan(s, TODAY)
  const m = summarizePeriod(s, p, 'month')
  assert.equal(m.uncoveredFrom, '2026-11-14')
  assert.equal(m.plannedDays, 10)
  assert.equal(m.historyStart, null)
  assert.equal(computePace(s, p, m), null) // no history, no manufactured pace
})

test('purchase checker tiers', () => {
  const s = base()
  s.buffer = { amount: 100, skipped: false }
  s.bills = [{ id: 'b', label: 'Phone', amount: 100, dueDate: '2026-11-10', paid: false }]
  const p = computePlan(s, TODAY) // flexible 300, daily 30
  const w = summarizePeriod(s, p, 'week')
  assert.equal(checkPurchase(p, w, 20).verdict, 'fitsToday')
  const later = checkPurchase(p, w, 120)
  assert.equal(later.verdict, 'fitsLater')
  assert.equal(later.newDaily, 20) // (300-120)/9
  assert.equal(checkPurchase(p, w, 350).verdict, 'dipsProtected')
  assert.equal(checkPurchase(p, w, 450).verdict, 'risksBills')
  assert.equal(checkPurchase(p, w, 600).verdict, 'overBalance')
})

test('money finder ignores times and dates, reads signs', () => {
  assert.deepEqual(findMoney('2:14 PM').length, 0)
  assert.deepEqual(findMoney('10/26').length, 0)
  const h = findMoney('Trader Joe\'s -$18.42')
  assert.equal(h[0].value, 18.42)
  assert.equal(h[0].sign, '-')
  assert.equal(findMoney('Payroll +$1,250.00')[0].value, 1250)
  assert.equal(findMoney('($12.99)')[0].sign, '-')
})

const L = (text: string, conf = 92): OcrLine => ({ text, conf, y0: 0, y1: 0 })

test('parser reads two-line rows, headers, balance, and flags low confidence', () => {
  const r = parseLines(
    [
      L('Available balance'),
      L('$1,204.33'),
      L('Recent transactions'),
      L('Caffe Strada -$6.75'),
      L('Coffee · Today, 2:12 PM'),
      L("Trader Joe's -$18.42"),
      L('Groceries · Yesterday'),
      L('Mon, Nov 2'),
      L('Payroll Direct Dep +$420.00'),
      L('Blurry Shop -$9.99', 41),
    ],
    TODAY,
    'Screenshot 1',
  )
  assert.equal(r.balances[0].amount, 1204.33)
  assert.equal(r.rows.length, 4)
  const [a, b, c, d] = r.rows
  assert.equal(a.description, 'Caffe Strada')
  assert.equal(a.date, TODAY)
  assert.equal(a.category, 'coffee')
  assert.equal(a.include, true)
  assert.equal(b.date, '2026-11-03')
  assert.equal(b.category, 'groceries')
  assert.equal(c.kind, 'income')
  assert.equal(c.date, '2026-11-02')
  assert.equal(c.category, 'paycheck')
  assert.ok(d.flags.includes('hardToRead'))
  assert.equal(d.include, false)
})

test('amount centered on subtitle line still finds the name above', () => {
  const r = parseLines([L('Chipotle'), L('Eating out · Sat, Oct 31 -$11.85')], TODAY, 's')
  assert.equal(r.rows[0].description, 'Chipotle')
  assert.equal(r.rows[0].date, '2026-10-31')
  assert.equal(r.rows[0].category, 'eating-out')
})

test('rows without any date are flagged and not included', () => {
  const r = parseLines([L('Target $24.60')], TODAY, 's')
  assert.ok(r.rows[0].flags.includes('noDate'))
  assert.equal(r.rows[0].include, false)
})

test('frame merge removes scroll overlap but keeps real repeats', () => {
  const f = (rows: string[], label: string) => ({ label, rows: parseLines([L('Nov 3'), ...rows.map((x) => L(x))], TODAY, label).rows })
  const frames = [
    f(['Coffee Bar -$6.75', 'Coffee Bar -$6.75', 'Safeway -$31.20'], '0:00'),
    f(['Coffee Bar -$6.75', 'Safeway -$31.20', 'Lyft -$14.10'], '0:01'),
    f(['Safeway -$31.20', 'Lyft -$14.10', 'Netflix -$7.99'], '0:02'),
  ]
  const m = mergeFrames(frames)
  assert.deepEqual(
    m.rows.map((r) => `${r.description} ${r.amount}`),
    ['Coffee Bar 6.75', 'Coffee Bar 6.75', 'Safeway 31.2', 'Lyft 14.1', 'Netflix 7.99'],
  )
  assert.deepEqual(m.gaps, [])
})

test('frame merge flags a different reading and reports gaps', () => {
  const mk = (desc: string, amount: number, label: string) => parseLines([L('Nov 3'), L(`${desc} -$${amount.toFixed(2)}`)], TODAY, label).rows
  const m = mergeFrames([
    { label: '0:00', rows: mk('Trader Joes', 18.42, '0:00') },
    { label: '0:01', rows: mk('Trader Joes', 18.47, '0:01') },
    { label: '0:05', rows: mk('Rent Payment', 900, '0:05') },
  ])
  assert.equal(m.rows.length, 2)
  assert.ok(m.rows[0].flags.includes('readDifferently'))
  assert.equal(m.rows[0].include, false)
  assert.deepEqual(m.gaps, ['0:05'])
})

test('csv import with negative spending and quoted fields', () => {
  const rows = parseCSV('Date,Description,Amount\n11/02/2026,"Safeway, Berkeley",-31.20\n11/03/2026,Payroll,420.00\nbad,row,\n')
  const [header, ...body] = rows
  const m = guessMapping(header, body)
  const { drafts, skipped } = csvToDrafts(body, m, TODAY)
  assert.equal(skipped, 1)
  assert.equal(drafts[0].description, 'Safeway, Berkeley')
  assert.equal(drafts[0].kind, 'expense')
  assert.equal(drafts[0].date, '2026-11-02')
  assert.equal(drafts[1].kind, 'income')
})

test('credit card in full: whole balance owed is set aside, never the credit limit', () => {
  const s = base()
  s.payMethod = 'credit'
  s.card = { owed: 200, dueDate: '2026-11-25', payInFull: true, planPay: null }
  const p = computePlan(s, TODAY)
  assert.equal(p.ok, true)
  assert.equal(p.cardSetAside, 200)
  assert.equal(p.flexible, 300) // 500 cash - 200 card
  assert.equal(p.dailyAmount, 30)
})

test('credit card partial payer sets aside the planned payment and reports the rest as debt', () => {
  const s = base()
  s.payMethod = 'both'
  s.card = { owed: 900, dueDate: '2026-11-20', payInFull: false, planPay: 100 }
  const p = computePlan(s, TODAY)
  assert.equal(p.cardSetAside, 100)
  assert.equal(p.cardRemaining, 800)
  assert.equal(p.flexible, 400)
})

test('card users need card info before safe to spend', () => {
  const s = base()
  s.payMethod = 'credit'
  const p = computePlan(s, TODAY)
  assert.equal(p.ok, false)
  assert.deepEqual(p.missing, ['card'])
})

test('card purchases recorded after the balances lower spending money', () => {
  const s = base()
  s.payMethod = 'credit'
  s.card = { owed: 100, dueDate: null, payInFull: true, planPay: null }
  s.txns = [txn({ amount: 40, inBalance: false, date: '2026-11-03' })]
  const p = computePlan(s, TODAY)
  assert.equal(p.flexible, 360) // 500 - 40 - 100
})

test('checker counts the card payment as owed money', () => {
  const s = base()
  s.payMethod = 'credit'
  s.card = { owed: 300, dueDate: null, payInFull: true, planPay: null }
  const p = computePlan(s, TODAY) // cash 500, flexible 200
  const r = checkPurchase(p, null, 450)
  assert.equal(r.verdict, 'risksBills')
  assert.match(r.title, /card payment/)
})

test('credit limit and available credit are never balances or transactions', () => {
  const r = parseLines(
    [L('Current balance'), L('$412.08'), L('Available credit'), L('$2,087.92'), L('Credit limit $2,500.00'), L('Minimum payment due $35.00'), L('Nov 2'), L('Target -$24.60')],
    TODAY,
    's',
  )
  assert.deepEqual(r.balances.map((b) => b.amount), [412.08, 35])
  assert.deepEqual(r.rows.map((x) => x.description), ['Target'])
})

import { guessSchedule } from './deposits.ts'

test('deposit schedule: two paychecks 14 days apart suggest every two weeks', () => {
  const g = guessSchedule(
    [
      { description: 'CAMPUS JOB PAYROLL', date: '2026-10-30', amount: 410 },
      { description: 'Campus Job Payroll', date: '2026-10-16', amount: 395 },
      { description: 'Venmo from Alex', date: '2026-10-20', amount: 25 },
    ],
    TODAY,
  )!
  assert.equal(g.pattern, 'biweekly')
  assert.equal(g.nextDate, '2026-11-13')
})

test('deposit schedule: monthly clamps to month end, irregular gives nothing', () => {
  const m = guessSchedule([{ description: 'Family', date: '2026-09-30', amount: 300 }, { description: 'Family', date: '2026-10-31', amount: 300 }], TODAY)!
  assert.equal(m.pattern, 'monthly')
  assert.equal(m.nextDate, '2026-11-30')
  assert.equal(guessSchedule([{ description: 'Tips', date: '2026-10-01', amount: 50 }, { description: 'Tips', date: '2026-10-20', amount: 70 }], TODAY), null)
  assert.equal(guessSchedule([{ description: 'Payroll', date: '2026-10-30', amount: 400 }], TODAY), null)
})
