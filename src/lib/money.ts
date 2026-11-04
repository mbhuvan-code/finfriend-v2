// Money is stored in dollars as numbers and rounded to cents at every boundary.

export const round2 = (n: number) => Math.round(n * 100) / 100

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function money(n: number): string {
  const v = round2(n)
  return `${v < 0 ? '−' : ''}$${fmt.format(Math.abs(v))}`
}

/** "−$12.40" for spending, "+$500.00" for income. */
export function signedMoney(n: number, kind: 'expense' | 'income'): string {
  return `${kind === 'expense' ? '−' : '+'}$${fmt.format(Math.abs(round2(n)))}`
}

export const HIDDEN = '$••••'

/** Parses user typed money like "1,240.50", "$30", " 12 ". Returns null when it is not a number. */
export function parseMoneyInput(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, '')
  if (cleaned === '' || !/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? round2(n) : null
}

export const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0))
