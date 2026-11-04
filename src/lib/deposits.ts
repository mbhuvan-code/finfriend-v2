// Suggests an income schedule from deposits the user uploaded. It's only a suggestion:
// the user has to tap it, and nothing is filled in on its own.

import { addDays, diffDays, makeISO, type ISODate } from './dates.ts'
import { normName } from './merge.ts'
import type { DraftTxn } from './parse.ts'
import type { IncomePattern } from './types.ts'

export interface Deposit {
  description: string
  date: ISODate
  amount: number
}

export interface ScheduleGuess {
  pattern: IncomePattern
  label: string
  source: string
  dates: ISODate[]
  nextDate: ISODate
  typicalAmount: number
}

function addMonth(iso: ISODate): ISODate {
  const [y, m, d] = iso.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  // Clamp to the last day of a shorter month.
  for (let day = d; day >= 28; day--) {
    const v = makeISO(ny, nm, day)
    if (v) return v
  }
  return makeISO(ny, nm, d)!
}

export function depositsFrom(rows: DraftTxn[]): Deposit[] {
  return rows
    .filter((r) => r.kind === 'income' && r.date && r.amount)
    .map((r) => ({ description: r.description, date: r.date!, amount: r.amount! }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/**
 * Looks for two or more deposits from the same source at a steady interval
 * (about 7, 14, or 28 to 31 days apart). Returns null when there's no clear pattern.
 */
export function guessSchedule(deposits: Deposit[], today: ISODate): ScheduleGuess | null {
  const groups = new Map<string, Deposit[]>()
  for (const d of deposits) {
    const key = normName(d.description).slice(0, 10)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), d])
  }
  let best: ScheduleGuess | null = null
  for (const list of groups.values()) {
    const dates = [...new Set(list.map((d) => d.date))].sort()
    if (dates.length < 2) continue
    const gaps = dates.slice(1).map((d, i) => diffDays(dates[i], d))
    const all = (lo: number, hi: number) => gaps.every((g) => g >= lo && g <= hi)
    let pattern: IncomePattern | null = null
    let label = ''
    let step: (d: ISODate) => ISODate = (d) => d
    if (all(6, 8)) {
      pattern = 'weekly'
      label = 'every week'
      step = (d) => addDays(d, 7)
    } else if (all(13, 15)) {
      pattern = 'biweekly'
      label = 'every two weeks'
      step = (d) => addDays(d, 14)
    } else if (all(28, 31)) {
      pattern = 'monthly'
      label = 'every month'
      step = addMonth
    }
    if (!pattern) continue
    let next = step(dates[dates.length - 1])
    for (let i = 0; i < 12 && next <= today; i++) next = step(next)
    if (next <= today) continue
    const amounts = list.map((d) => d.amount).sort((a, b) => a - b)
    const guess: ScheduleGuess = {
      pattern,
      label,
      source: list[0].description,
      dates,
      nextDate: next,
      typicalAmount: amounts[Math.floor(amounts.length / 2)],
    }
    if (!best || dates.length > best.dates.length) best = guess
  }
  return best
}
