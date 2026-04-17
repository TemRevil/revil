import type { Metadata } from 'next'
import './globals.css'
import '../lib/firebase'
import ClientProtection from './ClientProtection'

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: 'Tem Revil | Main Profile',
  description: 'Main Professional Profile and an advanced portfolio ecosystem.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&family=Permanent+Marker&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <ClientProtection />
        <div id="root">{children}</div>
      </body>
    </html>
  )
}
