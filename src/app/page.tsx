'use client'
import dynamic from 'next/dynamic'

// Disable SSR for the entire React SPA application since it relies heavily 
// on browser APIs (window, document, animations) synchronously
const App = dynamic(() => import('../App'), { ssr: false })

export default function Page() {
  return <App />
}
