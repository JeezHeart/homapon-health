/**
 * Entry point ng buong frontend app para sa Barangay Homapon Child Immunization system.
 *
 * Dito nino-mount yung root React component (`App`) sa `#root` element ng HTML at dito rin
 * nilo-load yung global CSS (`index.css`). Check mo dito kapag blank page sa startup o walang styles.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// I-render yung App sa loob ng React StrictMode para mahuli agad yung accidental side effects habang nagde-dev.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
