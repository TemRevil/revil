'use client'
import dynamic from 'next/dynamic'

// Serve the SPA router as the 404 fallback for GitHub pages integration
const App = dynamic(() => import('../App'), { ssr: false })

export default function NotFound() {
  return <App />
}
