// One financial data model for every screen. Confirmed data is saved in this browser's
// localStorage (not encrypted). Raw screenshots and videos are never saved.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { computePace, computePlan, computeStatus, summarizePeriod, type PeriodId } from '../lib/calc'
import { todayISO } from '../lib/dates'
import { emptyState, type FinState } from '../lib/types'
import { sampleState } from '../lib/sample'
import { setDemoMode, setOptOut, startAnalytics, track } from '../lib/analytics'

const KEY = 'finfriend.v2'

function load(): FinState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as FinState
    if (parsed.version !== 2) return emptyState()
    const s = { ...emptyState(), ...parsed }
    if (s.settings.hideOnOpen) s.settings = { ...s.settings, hideAmounts: true }
    return s
  } catch {
    return emptyState()
  }
}

interface Store {
  state: FinState
  update: (fn: (s: FinState) => FinState) => void
  clearAll: () => void
  /** Replaces everything with clearly labeled sample data, for demos. */
  loadSample: () => void
  today: string
  hidden: boolean
  setHidden: (h: boolean) => void
  period: PeriodId
  setPeriod: (p: PeriodId) => void
  saveError: boolean
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FinState>(load)
  const [period, setPeriod] = useState<PeriodId>('week')
  const [today, setToday] = useState(todayISO())
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [state])

  // Anonymous usage analytics (see lib/analytics.ts). Starts once, honors the opt-out setting.
  const optedOut = !!state.settings.analyticsOff
  const firstOptRun = useRef(true)
  useEffect(() => {
    startAnalytics(optedOut)
    if (firstOptRun.current) firstOptRun.current = false
    else setOptOut(optedOut)
  }, [optedOut])
  useEffect(() => setDemoMode(!!state.demo), [state.demo])

  // Keep "today" right if the app stays open past midnight.
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000)
    return () => clearInterval(t)
  }, [])

  const update = useCallback((fn: (s: FinState) => FinState) => setState((s) => fn(s)), [])
  const clearAll = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* storage unavailable: nothing saved to clear */
    }
    track('data_cleared')
    // Keep the analytics choice: clearing data shouldn't turn analytics back on.
    setState((s) => ({ ...emptyState(), settings: { ...emptyState().settings, analyticsOff: s.settings.analyticsOff } }))
    setPeriod('week')
  }, [])
  const loadSample = useCallback(() => {
    setState((s) => ({ ...sampleState(todayISO()), settings: { ...sampleState(todayISO()).settings, analyticsOff: s.settings.analyticsOff } }))
    setPeriod('week')
    track('demo_started')
  }, [])
  const setHidden = useCallback(
    (h: boolean) => {
      track('hide_toggled', { hidden: h })
      setState((s) => ({ ...s, settings: { ...s.settings, hideAmounts: h } }))
    },
    [],
  )

  const value = useMemo(
    () => ({ state, update, clearAll, loadSample, today, hidden: state.settings.hideAmounts, setHidden, period, setPeriod, saveError }),
    [state, update, clearAll, loadSample, today, setHidden, period, saveError],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore outside provider')
  return v
}

/** Derived numbers. Every screen reads from here so amounts always match. */
export function useFinance() {
  const { state, today, period } = useStore()
  return useMemo(() => {
    const plan = computePlan(state, today)
    const summary = summarizePeriod(state, plan, period)
    const week = summarizePeriod(state, plan, 'week')
    const pace = computePace(state, plan, summary)
    const weekPace = computePace(state, plan, week)
    const status = computeStatus(plan, weekPace)
    return { plan, summary, week, pace, status }
  }, [state, today, period])
}
