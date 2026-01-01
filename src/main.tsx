import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import './lib/firebase'
import App from './App.tsx'
import { LoadingProvider } from './LoadingContext'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <LoadingProvider>
      <App />
    </LoadingProvider>
  </StrictMode>,
)
