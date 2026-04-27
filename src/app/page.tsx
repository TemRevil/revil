'use client'
import dynamic from 'next/dynamic'

// Disable SSR for the entire React SPA application since it relies heavily 
// on browser APIs (window, document, animations) synchronously
const App = dynamic(() => import('../App'), { ssr: false })

export default function Page() {
  return (
    <>
      <noscript>
        <section
          style={{
            padding: '24px',
            fontFamily: 'Inter, sans-serif',
            background: '#08090d',
            color: '#f5f7fb',
          }}
        >
          <h1 style={{ marginBottom: '12px' }}>Tem Revil</h1>
          <p style={{ marginBottom: '10px', maxWidth: '720px', lineHeight: 1.7 }}>
            Mohammed Ahmed, known publicly as Tem Revil, is a frontend and AI engineer
            based in El Mansoura, Egypt.
          </p>
          <p style={{ marginBottom: '10px', maxWidth: '720px', lineHeight: 1.7 }}>
            This website is the main portfolio and canonical profile for Tem Revil,
            Temrevil, Mohammed Ahmed, and related searches about frontend engineering in
            El Mansoura or El Mansourah.
          </p>
          <p style={{ margin: 0 }}>
            Visit <a href="https://temrevil.com">temrevil.com</a> for projects, contact
            details, and profile links.
          </p>
        </section>
      </noscript>
      <App />
    </>
  )
}
