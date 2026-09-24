import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Book a call | Tem Revil',
  description: 'Book a free 30 minute Google Meet call with Tem Revil (Mohammed Ahmed), AI products expert: your project, a role, a collab or a podcast.',
  alternates: { canonical: '/book' },
  openGraph: {
    title: 'Book a call with Tem Revil',
    description: 'A free 30 minute Google Meet call. Pick a time in your own time zone.',
    url: 'https://temrevil.com/book',
  },
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children
}
