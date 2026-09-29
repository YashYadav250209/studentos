import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SpotlightProvider } from './components/core/spotlight-provider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SpotlightProvider>
      <App />
    </SpotlightProvider>
  </StrictMode>,
)
