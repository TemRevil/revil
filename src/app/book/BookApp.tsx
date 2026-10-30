'use client'
import dynamic from 'next/dynamic'

// Client-only like the main app: the calendar, the time zones and the paint all depend
// on the visitor's clock and the DOM, so a build-time render would only mismatch.
const BookPage = dynamic(() => import('../../book/BookPage'), { ssr: false })

export default function BookApp() {
  return <BookPage />
}
