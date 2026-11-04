// Turns OCR lines from a banking screenshot (or one video frame) into draft transactions.
// Nothing here is trusted: every row carries flags, and flagged rows start unselected
// so the user decides what gets saved.

import { INCOME_WORDS, suggestCategory } from './categories.ts'
import { addDays, makeISO, MONTH_INDEX, weekday, type ISODate } from './dates.ts'
import { round2 } from './money.ts'
import type { Kind } from './types.ts'

export interface OcrLine {
  text: string
  conf: number // 0..100
  y0: number
  y1: number
}

export type Flag = 'hardToRead' | 'noDate' | 'kindGuessed' | 'nameUnclear' | 'readDifferently' | 'possibleDuplicate' | 'weekdayDate'

export const FLAG_TEXT: Record<Flag, string> = {
  hardToRead: 'Hard to read. Check the name and amount.',
  noDate: 'No date found. Add one.',
  kindGuessed: 'No + or − sign found. Check spending or income.',
  nameUnclear: 'Name is unclear. Edit it.',
  readDifferently: 'Read differently across frames. Check the amount.',
  possibleDuplicate: 'Looks like a transaction you already have. Include it only if it’s a separate purchase.',
  weekdayDate: 'Date guessed from a weekday name. Check it.',
}

export interface DraftTxn {
  id: string
  description: string
  date: ISODate | null
  amount: number | null
  kind: Kind
  category: string
  categorySure: boolean
  flags: Flag[]
  include: boolean
  pending: boolean
  conf: number
  /** Where it came from, e.g. "Screenshot 1" or "0:04". Helps users find it. */
  origin: string
  /** True when the date came from a header or the row itself (not carried from a previous frame). */
  dateExplicit: boolean
  alternates?: number[]
  source?: import('./types.ts').Source
}

export interface BalanceCandidate {
  amount: number
  label: string
  conf: number
  origin: string
}

export interface ParseResult {
  rows: DraftTxn[]
  balances: BalanceCandidate[]
  signsSeen: { minus: number; plus: number }
}

let counter = 0
const nextId = () => `d${Date.now().toString(36)}${(counter++).toString(36)}`

// -------------------------------------------------------------- money

interface MoneyHit {
  value: number
  sign: '+' | '-' | null
  index: number
  length: number
}

export function normalizeLine(raw: string): string {
  return raw
    .replace(/[−–—]/g, '-')
    .replace(/(^|[\s(+-])[S§]\s?(?=\d)/g, '$1$') // OCR often reads $ as S or §
    .replace(/\$\s+(?=\d)/g, '$')
    .replace(/(\d),\s(\d{3})/g, '$1,$2')
    .replace(/\s+/g, ' ')
    .trim()
}

const MONEY_RE = /(\()?([+-])?\s?(\$)?(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{2}))?(?![\d%])(\))?/g

export function findMoney(line: string): MoneyHit[] {
  const hits: MoneyHit[] = []
  for (const m of line.matchAll(MONEY_RE)) {
    const [whole, open, sign, dollar, intPart, cents, close] = m
    if (!dollar && cents === undefined) continue // plain integers are dates, counts, or times
    if (!dollar && sign === undefined && !open) {
      // "10.26" with no $ could be a date. Only accept if it has a thousands separator.
      if (!intPart.includes(',')) continue
    }
    const before = line[(m.index ?? 0) - 1]
    if (before && /[\d:/]/.test(before)) continue // part of a time or date
    const value = round2(Number(intPart.replace(/,/g, '')) + (cents ? Number(cents) / 100 : 0))
    let s: MoneyHit['sign'] = sign === '+' ? '+' : sign === '-' ? '-' : null
    if (open && close) s = '-'
    hits.push({ value, sign: s, index: m.index ?? 0, length: whole.length })
  }
  return hits
}

// -------------------------------------------------------------- dates

const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/i
const NUMERIC_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/
const WEEKDAY_RE = /\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?\b/i
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function inferYear(m: number, d: number, today: ISODate): ISODate | null {
  const y = Number(today.slice(0, 4))
  const guess = makeISO(y, m, d)
  if (!guess) return null
  // Bank history is in the past. A date more than a day ahead belongs to last year.
  return guess > addDays(today, 1) ? makeISO(y - 1, m, d) : guess
}

export interface DateHit {
  date: ISODate
  index: number
  length: number
  weekdayOnly: boolean
}

export function findDate(text: string, today: ISODate): DateHit | null {
  let m: RegExpMatchArray | null
  if ((m = text.match(/\btoday\b/i))) return { date: today, index: m.index!, length: m[0].length, weekdayOnly: false }
  if ((m = text.match(/\byesterday\b/i))) return { date: addDays(today, -1), index: m.index!, length: m[0].length, weekdayOnly: false }
  if ((m = text.match(ISO_RE))) {
    const iso = makeISO(Number(m[1]), Number(m[2]), Number(m[3]))
    if (iso) return { date: iso, index: m.index!, length: m[0].length, weekdayOnly: false }
  }
  if ((m = text.match(MONTH_RE))) {
    const mon = MONTH_INDEX[m[1].toLowerCase()]
    const day = Number(m[2])
    const iso = m[3] ? makeISO(Number(m[3]), mon, day) : inferYear(mon, day, today)
    if (iso) {
      // include a leading weekday like "Mon, " in the matched span
      const pre = text.slice(0, m.index).match(/(?:\b(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*,?\s*)$/i)
      const start = pre ? m.index! - pre[0].length : m.index!
      return { date: iso, index: start, length: m.index! - start + m[0].length, weekdayOnly: false }
    }
  }
  if ((m = text.match(NUMERIC_RE))) {
    const mon = Number(m[1])
    const day = Number(m[2])
    let iso: ISODate | null = null
    if (m[3]) {
      const yy = Number(m[3])
      iso = makeISO(yy < 100 ? 2000 + yy : yy, mon, day)
    } else iso = inferYear(mon, day, today)
    if (iso) return { date: iso, index: m.index!, length: m[0].length, weekdayOnly: false }
  }
  if ((m = text.match(WEEKDAY_RE))) {
    const target = WEEKDAYS.indexOf(m[1].toLowerCase().slice(0, 3))
    const back = (weekday(today) - target + 7) % 7
    return { date: addDays(today, -back), index: m.index!, length: m[0].length, weekdayOnly: true }
  }
  return null
}

// -------------------------------------------------------------- category words some banks print

const BANK_CATEGORY_WORDS: [RegExp, string][] = [
  [/\b(food (?:&|and) drink|dining|restaurants?|eating out|fast food)\b/i, 'eating-out'],
  [/\b(groceries|grocery|supermarkets?)\b/i, 'groceries'],
  [/\bcoffee\b/i, 'coffee'],
  [/\b(travel|transportation|transport|gas|rideshare|auto)\b/i, 'transport'],
  [/\b(shopping|merchandise|clothing)\b/i, 'shopping'],
  [/\b(entertainment|fun)\b/i, 'fun'],
  [/\b(bills?|utilities)\b/i, 'bills'],
  [/\b(health|medical|pharmacy)\b/i, 'health'],
  [/\b(education|school|study|books)\b/i, 'school'],
  [/\b(subscriptions?)\b/i, 'subscriptions'],
  [/\b(rent|housing)\b/i, 'housing'],
  [/\b(transfers?)\b/i, 'transfers'],
]

function categoryFromSubtitle(text: string): string | null {
  for (const [re, id] of BANK_CATEGORY_WORDS) if (re.test(text)) return id
  return null
}

// -------------------------------------------------------------- lines

const BALANCE_RE = /\b(available|current|account|ending|total|checking|savings|statement)?\s*balance\b|\bavailable\b|\bminimum (payment|due)\b/i
/** Borrowing room, not money. Never offered as a balance and never read as a transaction. */
const CREDIT_ROOM_RE = /\b(available credit|credit available|credit limit|credit line|available to borrow|spending limit)\b/i
const PENDING_RE = /^\s*pending\b/i
const NOISE_RE = /^(search|filter|transactions|activity|recent|see all|view all|accounts?|home|pay|transfer|deposit|menu|done|back|cancel|statements?|details)\b/i

function letters(s: string) {
  return (s.match(/[a-z]/gi) ?? []).length
}

export function cleanDescription(s: string): string {
  return s
    .replace(/[|•·»«>]+/g, ' ')
    .replace(/\s+[-–]\s*$/, '')
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9)'.]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripSpan(s: string, index: number, length: number) {
  return s.slice(0, index) + ' ' + s.slice(index + length)
}

const TIME_RE = /\b\d{1,2}:\d{2}\s?(?:am|pm)?\b/gi

interface LineInfo {
  text: string
  conf: number
  money: MoneyHit[]
  date: DateHit | null
  isHeader: boolean
  isBalance: boolean
  isPendingHeader: boolean
  used: boolean
}

export function parseLines(raw: OcrLine[], today: ISODate, origin: string): ParseResult {
  const lines: LineInfo[] = raw
    .map((l) => ({ ...l, text: normalizeLine(l.text) }))
    .filter((l) => l.text.length > 0)
    .map((l) => {
      const money = findMoney(l.text)
      const date = findDate(l.text, today)
      let rest = l.text
      if (date) rest = stripSpan(rest, date.index, date.length)
      const isHeader = !!date && money.length === 0 && letters(cleanDescription(rest)) <= 2
      return {
        text: l.text,
        conf: l.conf,
        money,
        date,
        isHeader,
        isBalance: BALANCE_RE.test(l.text),
        isPendingHeader: PENDING_RE.test(l.text) && money.length === 0,
        used: false,
      }
    })

  const balances: BalanceCandidate[] = []
  const rows: DraftTxn[] = []
  const signsSeen = { minus: 0, plus: 0 }
  let headerDate: ISODate | null = null
  let headerWeekday = false
  let inPending = false

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]
    if (CREDIT_ROOM_RE.test(L.text)) {
      L.used = true
      const next = lines[i + 1]
      if (L.money.length === 0 && next && next.money.length > 0 && letters(next.text.replace(/\$[\d,.]+/g, '')) <= 2) {
        next.used = true
        i++
      }
      continue
    }
    if (L.isHeader) {
      headerDate = L.date!.date
      headerWeekday = L.date!.weekdayOnly
      inPending = false
      L.used = true
      continue
    }
    if (L.isPendingHeader) {
      inPending = true
      L.used = true
      continue
    }
    // Balance: a balance word with an amount on the same line, or on the next line by itself.
    if (L.isBalance) {
      const next = lines[i + 1]
      if (L.money.length > 0) {
        balances.push({ amount: L.money[0].value, label: cleanDescription(L.text.slice(0, L.money[0].index)) || 'Balance', conf: L.conf, origin })
        L.used = true
        continue
      }
      if (next && next.money.length > 0 && letters(next.text.replace(/\$[\d,.]+/g, '')) <= 2) {
        balances.push({ amount: next.money[0].value, label: cleanDescription(L.text) || 'Balance', conf: Math.min(L.conf, next.conf), origin })
        L.used = true
        next.used = true
        i++
        continue
      }
    }
    if (L.used || L.money.length === 0) continue

    const hit = L.money[0]
    let desc = L.text.slice(0, hit.index)
    const after = L.text.slice(hit.index + hit.length)
    let date: DateHit | null = findDate(desc, today) ?? findDate(after, today)
    if (date) {
      const inDesc = findDate(desc, today)
      if (inDesc) desc = stripSpan(desc, inDesc.index, inDesc.length)
    }
    const hadTime = /\b\d{1,2}:\d{2}/.test(desc)
    desc = cleanDescription(desc.replace(TIME_RE, ' '))
    let conf = L.conf
    let subtitleCategory: string | null = null

    // Some apps center the amount between the name and a subtitle like "Coffee · Today, 2:12 PM",
    // so OCR puts it on the subtitle line. Then the real name is the line above.
    const lineIsSubtitle = !!date && (hadTime || !!categoryFromSubtitle(desc))

    // Description on the line above (two-line layouts).
    const prev = lines[i - 1]
    if ((letters(desc) < 2 || lineIsSubtitle) && prev && !prev.used && prev.money.length === 0 && !prev.isHeader && letters(prev.text) >= 2 && !NOISE_RE.test(prev.text)) {
      if (lineIsSubtitle) subtitleCategory = categoryFromSubtitle(desc)
      let p = prev.text
      if (prev.date) {
        date = date ?? prev.date
        p = stripSpan(p, prev.date.index, prev.date.length)
      }
      desc = cleanDescription(p)
      conf = Math.min(conf, prev.conf)
      prev.used = true
    }
    // Subtitle on the line below, like "Groceries · Yesterday".
    const next = lines[i + 1]
    if (next && !next.used && next.money.length === 0 && !next.isHeader && !next.isBalance) {
      const nd = next.date
      const cat = categoryFromSubtitle(next.text)
      const restLetters = letters(cleanDescription(nd ? stripSpan(next.text, nd.index, nd.length) : next.text))
      if (nd || (cat && restLetters <= 24)) {
        if (nd && !date) date = nd
        subtitleCategory = cat
        next.used = true
      }
    }
    L.used = true

    let flags: Flag[] = []
    let dateExplicit = true
    let finalDate: ISODate | null = date?.date ?? null
    let weekdayOnly = date?.weekdayOnly ?? false
    if (!finalDate && headerDate) {
      finalDate = headerDate
      weekdayOnly = headerWeekday
    }
    if (!finalDate) {
      flags.push('noDate')
      dateExplicit = false
    }
    if (weekdayOnly) flags.push('weekdayDate')
    if (conf < 70) flags.push('hardToRead')
    if (letters(desc) < 2) flags.push('nameUnclear')

    let kind: Kind = 'expense'
    if (hit.sign === '+') {
      kind = 'income'
      signsSeen.plus++
    } else if (hit.sign === '-') {
      signsSeen.minus++
    } else if (INCOME_WORDS.test(desc)) {
      kind = 'income'
      flags.push('kindGuessed')
    }

    const suggested = suggestCategory(desc, kind)
    const category = kind === 'expense' && subtitleCategory ? subtitleCategory : suggested.id
    flags = [...new Set(flags)]
    rows.push({
      id: nextId(),
      description: desc,
      date: finalDate,
      amount: hit.value,
      kind,
      category,
      categorySure: kind === 'expense' && !!subtitleCategory ? true : suggested.sure,
      flags,
      include: flags.length === 0,
      pending: inPending,
      conf,
      origin,
      dateExplicit,
      _sign: hit.sign,
    } as DraftTxn & { _sign: MoneyHit['sign'] })
  }

  // If the screenshot marks spending with "−" but never uses "+", unsigned rows are probably income.
  for (const r of rows as (DraftTxn & { _sign?: MoneyHit['sign'] })[]) {
    if (r._sign === null && r.kind === 'expense' && signsSeen.minus > 0 && signsSeen.plus === 0) {
      r.kind = 'income'
      r.category = suggestCategory(r.description, 'income').id
      if (!r.flags.includes('kindGuessed')) r.flags.push('kindGuessed')
      r.include = false
    }
    delete r._sign
  }

  return { rows, balances, signsSeen }
}

/** Marks rows in one batch that look identical, so the user can decide if both are real. */
export function markLikelyDuplicates(rows: DraftTxn[]): void {
  const seen = new Map<string, DraftTxn>()
  for (const r of rows) {
    const key = `${r.description.toLowerCase().replace(/[^a-z0-9]/g, '')}|${r.amount}|${r.date}`
    const prior = seen.get(key)
    if (prior && prior.origin !== r.origin) {
      if (!r.flags.includes('possibleDuplicate')) r.flags.push('possibleDuplicate')
      r.include = false
    } else seen.set(key, r)
  }
}
