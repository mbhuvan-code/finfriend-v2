// Everything uploaded during onboarding lands here, whatever step it came from.
// A balance screenshot that also shows purchases doesn't have to be uploaded again:
// its rows wait for the transactions step. Nothing here is saved until the user confirms.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { similarity } from '../../lib/merge'
import type { BalanceCandidate, DraftTxn } from '../../lib/parse'
import type { Txn } from '../../lib/types'
import type { ImportResult } from '../import/Importer'

export function txnToDraft(t: Txn): DraftTxn {
  return {
    id: t.id,
    description: t.description,
    date: t.date,
    amount: t.amount,
    kind: t.kind,
    category: t.category,
    categorySure: true,
    flags: [],
    include: true,
    pending: false,
    conf: 100,
    origin: t.source === 'manual' ? 'Added by you' : t.source === 'csv' ? 'CSV' : t.source === 'recording' ? 'Recording' : 'Screenshot',
    dateExplicit: true,
    source: t.source,
  }
}

export function draftToTxn(d: DraftTxn, balanceAsOf: string | null): Txn {
  return {
    id: d.id,
    description: d.description.trim(),
    date: d.date!,
    amount: d.amount!,
    kind: d.kind,
    category: d.category,
    source: d.source ?? 'manual',
    // Rows dated on or before the balance date are already reflected in that balance.
    inBalance: balanceAsOf !== null && d.date! <= balanceAsOf,
  }
}

interface Pool {
  rows: DraftTxn[]
  setRows: (r: DraftTxn[]) => void
  balances: BalanceCandidate[]
  notes: string[]
  warnings: string[]
  /** Adds an upload's results. Returns how many new transaction rows it brought in. */
  add: (r: ImportResult) => number
}

const Ctx = createContext<Pool | null>(null)

export function PoolProvider({ initial, children }: { initial: Txn[]; children: ReactNode }) {
  const [rows, setRows] = useState<DraftTxn[]>(() => initial.map(txnToDraft))
  const [balances, setBalances] = useState<BalanceCandidate[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  const add = useCallback(
    (r: ImportResult) => {
      // Rows that match something from an earlier upload start unchecked, so nothing counts twice.
      for (const row of r.rows) {
        const dup = rows.some((x) => x.amount === row.amount && x.date === row.date && x.kind === row.kind && similarity(x.description, row.description) >= 0.6)
        if (dup) {
          if (!row.flags.includes('possibleDuplicate')) row.flags.push('possibleDuplicate')
          row.include = false
        }
      }
      setRows((prev) => [...prev, ...r.rows])
      setBalances((prev) => [...prev, ...r.balances.filter((b) => !prev.some((p) => p.amount === b.amount))])
      setNotes(r.notes)
      setWarnings(r.warnings)
      return r.rows.length
    },
    [rows],
  )

  const value = useMemo(() => ({ rows, setRows, balances, notes, warnings, add }), [rows, balances, notes, warnings, add])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePool() {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePool outside PoolProvider')
  return v
}
