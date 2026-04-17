'use client'
import dynamic from 'next/dynamic'

// Fallback for custom routing to support the existing SPA architecture
const App = dynamic(() => import('../../App'), { ssr: false })

export default function Page() {
  return <App />
}
