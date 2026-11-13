import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import './styles.css'
import { StoreProvider } from './state/store'
import { App } from './App'
import { savedOptOut, startAnalytics } from './lib/analytics'

// Start analytics before the first render so the first screen's event isn't lost.
startAnalytics(savedOptOut())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
