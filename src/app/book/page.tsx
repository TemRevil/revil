'use client'
import dynamic from 'next/dynamic'

// Client-only like the main app: the calendar, the time zones and the paint all depend
// on the visitor's clock and the DOM, so a build-time render would only mismatch.
const BookPage = dynamic(() => import('../../components/book/BookPage'), { ssr: false })

export default function Page() {
  return (
    <>
      <noscript>
        <p style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
          Book a free 30 minute Google Meet call with Tem Revil (Mohammed Ahmed). This page needs
          JavaScript; you can also email <a href="mailto:hello@temrevil.com">hello@temrevil.com</a>.
        </p>
      </noscript>
      <BookPage />
    </>
  )
}
