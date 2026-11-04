// All dates are local calendar days stored as 'YYYY-MM-DD'.
// Math is done at UTC noon so daylight saving changes never shift a day.

export type ISODate = string

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function toISO(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): ISODate {
  return toISO(new Date())
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime())
}

function parse(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

export function makeISO(y: number, m: number, d: number): ISODate | null {
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parse(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whole days from a to b (b minus a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}

export function weekday(iso: ISODate): number {
  return parse(iso).getUTCDay()
}

/** Monday of the week containing iso. */
export function startOfWeek(iso: ISODate): ISODate {
  const wd = weekday(iso)
  return addDays(iso, -((wd + 6) % 7))
}

export function startOfMonth(iso: ISODate): ISODate {
  return iso.slice(0, 8) + '01'
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = parse(startOfMonth(iso))
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b
}
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b
}

export function fmtShort(iso: ISODate): string {
  const d = parse(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function fmtDay(iso: ISODate): string {
  const d = parse(iso)
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function fmtLongHeader(iso: ISODate): string {
  const d = parse(iso)
  return `${DAYS_LONG[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** "Today", "Yesterday", "Tomorrow", or "Mon, Oct 26". */
export function fmtRelative(iso: ISODate, today: ISODate): string {
  const n = diffDays(today, iso)
  if (n === 0) return 'Today'
  if (n === -1) return 'Yesterday'
  if (n === 1) return 'Tomorrow'
  return fmtDay(iso)
}

export function fmtRange(start: ISODate, end: ISODate): string {
  if (start === end) return fmtDay(start)
  return `${fmtShort(start)} to ${fmtShort(end)}`
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}

export const MONTH_INDEX: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}
