import type { Metadata } from 'next'

// The sign-in step of the AI assistant's OAuth flow: a page for the owner, not for
// search results. (The page itself is a client component, so its metadata lives here.)
export const metadata: Metadata = {
  title: 'Sign in | Tem Revil',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
}

export default function McpLoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
