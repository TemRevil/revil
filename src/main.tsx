import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import './lib/firebase'
import App from './App.tsx'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
