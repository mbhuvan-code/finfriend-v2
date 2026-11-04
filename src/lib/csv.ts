// CSV import for bank exports. Column guesses are shown to the user and can be changed.

import { suggestCategory } from './categories.ts'
import { findDate, type DraftTxn } from './parse.ts'
import { round2 } from './money.ts'
import type { ISODate } from './dates.ts'

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows.map((r) => r.map((f) => f.trim()))
}

export interface CsvMapping {
  date: number
  description: number
  amount: number // -1 when using debit/credit columns
  debit: number
  credit: number
  /** For a single amount column: what a positive number means in this file. */
  positiveMeans: 'expense' | 'income'
}

export function guessMapping(header: string[], body: string[][]): CsvMapping {
  const find = (re: RegExp) => header.findIndex((h) => re.test(h))
  const date = find(/date|posted|time/i)
  const description = find(/desc|merchant|name|payee|memo|details|narrative/i)
  const amount = find(/^amount$|amount|value/i)
  const debit = find(/debit|withdraw|money out|paid out|outflow/i)
  const credit = find(/credit|deposit|money in|paid in|inflow/i)
  const useSplit = debit >= 0 && credit >= 0 && debit !== amount
  let positiveMeans: CsvMapping['positiveMeans'] = 'income'
  if (!useSplit && amount >= 0) {
    // Most bank exports show spending as negative numbers. If almost everything is positive,
    // positive probably means spending. The user can flip this on the review screen.
    const vals = body.map((r) => parseAmount(r[amount] ?? '')).filter((v): v is number => v !== null)
    const neg = vals.filter((v) => v < 0).length
    positiveMeans = neg === 0 && vals.length > 0 ? 'expense' : 'income'
  }
  return {
    date: date >= 0 ? date : 0,
    description: description >= 0 ? description : 1,
    amount: useSplit ? -1 : amount >= 0 ? amount : 2,
    debit: useSplit ? debit : -1,
    credit: useSplit ? credit : -1,
    positiveMeans,
  }
}

export function parseAmount(s: string): number | null {
  const neg = /^\(.*\)$/.test(s.trim()) || /^-|^−|-$/.test(s.trim())
  const n = Number(s.replace(/[^0-9.]/g, ''))
  if (!/\d/.test(s) || !Number.isFinite(n)) return null
  return round2(neg ? -n : n)
}

export function looksLikeHeader(row: string[]): boolean {
  return row.filter((f) => /[a-z]/i.test(f) && !/\d{1,2}\/\d{1,2}/.test(f)).length >= 2 && !row.some((f) => /^-?\$?\d+[.,]\d{2}$/.test(f))
}

export function csvToDrafts(rows: string[][], m: CsvMapping, today: ISODate): { drafts: DraftTxn[]; skipped: number } {
  const drafts: DraftTxn[] = []
  let skipped = 0
  rows.forEach((r, i) => {
    const desc = (r[m.description] ?? '').trim()
    let value: number | null = null
    let kind: 'expense' | 'income' = 'expense'
    if (m.amount >= 0) {
      const v = parseAmount(r[m.amount] ?? '')
      if (v !== null && v !== 0) {
        value = Math.abs(v)
        const positiveIsIncome = m.positiveMeans === 'income'
        kind = v > 0 === positiveIsIncome ? 'income' : 'expense'
      }
    } else {
      const d = parseAmount(r[m.debit] ?? '')
      const c = parseAmount(r[m.credit] ?? '')
      if (d) {
        value = Math.abs(d)
        kind = 'expense'
      } else if (c) {
        value = Math.abs(c)
        kind = 'income'
      }
    }
    if (value === null) {
      skipped++
      return
    }
    const dh = findDate(r[m.date] ?? '', today)
    const flags: DraftTxn['flags'] = []
    if (!dh || dh.weekdayOnly) flags.push('noDate')
    if (!/[a-z]/i.test(desc)) flags.push('nameUnclear')
    const cat = suggestCategory(desc, kind)
    drafts.push({
      id: `csv${i}_${Date.now().toString(36)}`,
      description: desc,
      date: dh && !dh.weekdayOnly ? dh.date : null,
      amount: value,
      kind,
      category: cat.id,
      categorySure: cat.sure,
      flags,
      include: flags.length === 0,
      pending: false,
      conf: 100,
      origin: `CSV row ${i + 2}`,
      dateExplicit: true,
    })
  })
  return { drafts, skipped }
}
