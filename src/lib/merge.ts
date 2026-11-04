// Merges transactions read from consecutive frames of a scrolling screen recording.
// Neighbouring frames overlap, so the same row shows up several times. Rows are matched
// one to one, in order, against the rows seen in the previous frame. That way two real
// $6.75 coffees on the same day stay two rows, while a row seen in five frames becomes one.

import type { DraftTxn } from './parse.ts'

export function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function similarity(a: string, b: string): number {
  const x = normName(a)
  const y = normName(b)
  if (!x && !y) return 1
  if (!x || !y) return 0
  if (x === y) return 1
  const m = x.length
  const n = y.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return 1 - prev[n] / Math.max(m, n)
}

function datesCompatible(a: DraftTxn, b: DraftTxn) {
  return a.date === b.date || !a.date || !b.date || !a.dateExplicit || !b.dateExplicit
}

/** 'same' = confident match, 'variant' = same row but the amount was read differently. */
export function matchKind(a: DraftTxn, b: DraftTxn): 'same' | 'variant' | null {
  if (!datesCompatible(a, b)) return null
  const sim = similarity(a.description, b.description)
  if (a.amount === b.amount && a.kind === b.kind && sim >= 0.6) return 'same'
  if (sim >= 0.85 && a.amount !== null && b.amount !== null) {
    const sa = a.amount.toFixed(2)
    const sb = b.amount.toFixed(2)
    let diff = 0
    if (sa.length === sb.length) for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) diff++
    if (sa.length === sb.length && diff === 1) return 'variant'
  }
  return null
}

function refreshInclude(r: DraftTxn) {
  r.include = r.flags.length === 0
}

function absorb(target: DraftTxn, incoming: DraftTxn, kind: 'same' | 'variant') {
  if (kind === 'variant' && incoming.amount !== null && target.amount !== null) {
    const alts = new Set([...(target.alternates ?? [target.amount]), incoming.amount])
    target.alternates = [...alts]
    if (!target.flags.includes('readDifferently')) target.flags.push('readDifferently')
  }
  // Keep the clearest reading of the name and amount.
  if (incoming.conf > target.conf) {
    target.description = incoming.description
    if (kind === 'same') target.amount = incoming.amount
    target.conf = incoming.conf
    target.flags = target.flags.filter((f) => f !== 'hardToRead' || incoming.flags.includes('hardToRead'))
    target.flags = target.flags.filter((f) => f !== 'nameUnclear' || incoming.flags.includes('nameUnclear'))
  }
  if ((!target.date || !target.dateExplicit) && incoming.date && incoming.dateExplicit) {
    target.date = incoming.date
    target.dateExplicit = true
    target.flags = target.flags.filter((f) => f !== 'noDate')
  }
  if (!target.categorySure && incoming.categorySure) {
    target.category = incoming.category
    target.categorySure = true
  }
  refreshInclude(target)
}

export interface MergeResult {
  rows: DraftTxn[]
  /** Frame labels where no overlap with the previous frame was found, so rows may be missing. */
  gaps: string[]
}

export function mergeFrames(frames: { label: string; rows: DraftTxn[] }[]): MergeResult {
  let all: DraftTxn[] = []
  const gaps: string[] = []
  let prevStart = 0

  for (const frame of frames) {
    if (frame.rows.length === 0) continue
    if (all.length === 0) {
      all = frame.rows.map((r) => ({ ...r, flags: [...r.flags] }))
      prevStart = 0
      continue
    }
    // Pass 1: match rows in order against rows from the previous frame onward.
    const matches: number[] = []
    const kinds: ('same' | 'variant' | null)[] = []
    let cursor = prevStart
    for (const r of frame.rows) {
      let found = -1
      let kind: 'same' | 'variant' | null = null
      for (let k = cursor; k < all.length; k++) {
        const mk = matchKind(all[k], r)
        if (mk) {
          found = k
          kind = mk
          break
        }
      }
      matches.push(found)
      kinds.push(kind)
      if (found >= 0) cursor = found + 1
    }
    const firstMatched = matches.find((m) => m >= 0) ?? -1
    if (firstMatched < 0) gaps.push(frame.label)

    // Pass 2: absorb matches; place new rows next to the matched row above them on screen.
    const before = new Map<number, DraftTxn[]>()
    const after = new Map<number, DraftTxn[]>()
    const atEnd: DraftTxn[] = []
    const resolved: DraftTxn[] = []
    let lastMatched = -1
    frame.rows.forEach((r, i) => {
      const m = matches[i]
      if (m >= 0) {
        absorb(all[m], r, kinds[i]!)
        lastMatched = m
        resolved.push(all[m])
        return
      }
      const copy: DraftTxn = { ...r, flags: [...r.flags] }
      // A row with no date header above it in this frame takes the date of the row above it.
      const above = resolved[resolved.length - 1]
      if (!copy.dateExplicit && above?.date) {
        copy.date = above.date
        copy.dateExplicit = above.dateExplicit
        copy.flags = copy.flags.filter((f) => f !== 'noDate')
        refreshInclude(copy)
      }
      resolved.push(copy)
      if (lastMatched >= 0) after.set(lastMatched, [...(after.get(lastMatched) ?? []), copy])
      else if (firstMatched >= 0) before.set(firstMatched, [...(before.get(firstMatched) ?? []), copy])
      else atEnd.push(copy)
    })
    const out: DraftTxn[] = []
    all.forEach((row, k) => {
      out.push(...(before.get(k) ?? []), row, ...(after.get(k) ?? []))
    })
    out.push(...atEnd)
    all = out
    prevStart = Math.max(0, all.indexOf(resolved[0]))
  }
  return { rows: all, gaps }
}
