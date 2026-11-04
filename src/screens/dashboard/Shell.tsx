import { scrollToTop } from '../../lib/scroll'
import { useCallback, useMemo, useState } from 'react'
import { Activity as ActivityIcon, Home as HomeIcon, Plus, Receipt, Target } from 'lucide-react'
import { useStore } from '../../state/store'
import type { ImportMode } from '../import/Importer'
import { Home } from './Home'
import { Activity, Bills, Goals } from './Tabs'
import { BalanceSheet, CalcSheet, CheckSheet, ImportSheet, IncomeSheet, SettingsSheet, TxnSheet } from './sheets'

type Tab = 'home' | 'activity' | 'bills' | 'goals'

export interface UI {
  openCheck: () => void
  openTxn: (id: string | null) => void
  openSettings: () => void
  openImport: (m: ImportMode) => void
  openBalance: () => void
  openIncome: () => void
  openCalc: () => void
  openCard: () => void
  openActivity: (filter: string | null) => void
}

export function Shell() {
  const { state, update, clearAll } = useStore()
  const [tab, setTab] = useState<Tab>('home')
  const [filter, setFilter] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'check' | 'txn' | 'settings' | 'import' | 'balance' | 'income' | 'calc'>(null)
  const [txnId, setTxnId] = useState<string | null>(null)
  const [txnKey, setTxnKey] = useState(0)
  const [importMode, setImportMode] = useState<ImportMode>('screenshot')
  const close = useCallback(() => setSheet(null), [])

  const go = (t: Tab) => {
    setTab(t)
    scrollToTop()
  }

  const ui: UI = useMemo(
    () => ({
      openCheck: () => setSheet('check'),
      openTxn: (id) => {
        setTxnId(id)
        setTxnKey((k) => k + 1)
        setSheet('txn')
      },
      openSettings: () => setSheet('settings'),
      openImport: (m) => {
        setImportMode(m)
        setSheet('import')
      },
      openBalance: () => setSheet('balance'),
      openIncome: () => setSheet('income'),
      openCalc: () => setSheet('calc'),
      openCard: () => setSheet('balance'),
      openActivity: (f) => {
        setFilter(f)
        setTab('activity')
        scrollToTop()
      },
    }),
    [],
  )

  const NavBtn = ({ id, label, Icon }: { id: Tab; label: string; Icon: typeof HomeIcon }) => (
    <button type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
      <Icon size={24} strokeWidth={2} aria-hidden />
      {label}
    </button>
  )

  return (
    <>
      {state.demo && (
        <div className="demo-banner" role="status">
          <span>
            <strong>Sample data.</strong> These numbers are made up for a demo.
          </span>
          <button
            type="button"
            className="btn sm on-demo"
            onClick={() => {
              clearAll()
              scrollToTop()
            }}
          >
            Use my own info
          </button>
        </div>
      )}
      {tab === 'home' && <Home ui={ui} />}
      {tab === 'activity' && <Activity ui={ui} filter={filter} setFilter={setFilter} />}
      {tab === 'bills' && <Bills ui={ui} />}
      {tab === 'goals' && <Goals ui={ui} />}

      <nav className="nav" aria-label="Main">
        <NavBtn id="home" label="Home" Icon={HomeIcon} />
        <NavBtn id="activity" label="Activity" Icon={ActivityIcon} />
        <button type="button" className="center-action" aria-label="Add expense" onClick={() => ui.openTxn(null)}>
          <span className="fab">
            <Plus size={26} strokeWidth={2.25} aria-hidden />
          </span>
        </button>
        <NavBtn id="bills" label="Bills" Icon={Receipt} />
        <NavBtn id="goals" label="Goals" Icon={Target} />
      </nav>

      <CheckSheet open={sheet === 'check'} onClose={close} />
      {sheet === 'txn' && <TxnSheet key={txnKey} open txnId={txnId} onClose={close} />}
      <SettingsSheet
        open={sheet === 'settings'}
        onClose={close}
        onEdit={(w) => {
          if (w === 'setup') {
            setSheet(null)
            update((s) => ({ ...s, onboarding: { ...s.onboarding, complete: false, step: 7 } }))
          } else setSheet(w)
        }}
      />
      {sheet === 'import' && <ImportSheet open mode={importMode} onClose={close} onManual={() => ui.openTxn(null)} />}
      {sheet === 'balance' && <BalanceSheet open onClose={close} />}
      <IncomeSheet open={sheet === 'income'} onClose={close} />
      <CalcSheet open={sheet === 'calc'} onClose={close} />
    </>
  )
}
