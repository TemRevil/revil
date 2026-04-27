'use client'
import dynamic from 'next/dynamic'

// Keep client-side routes working when a static host serves the 404 page directly.
const App = dynamic(() => import('../App'), { ssr: false })

export default function NotFound() {
  return <App />
}
