import { useStore } from './state/store'
import { Onboarding } from './screens/onboarding/Onboarding'
import { Shell } from './screens/dashboard/Shell'

export function App() {
  const { state } = useStore()
  return (
    // On a computer, .device draws a phone frame. On a phone it adds nothing.
    <div className="device">
      <div className="device-island" aria-hidden />
      <div className="shell">{state.onboarding.complete ? <Shell /> : <Onboarding />}</div>
    </div>
  )
}
