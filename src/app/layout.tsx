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
        {/* Content Security Policy — defense-in-depth against XSS */}
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com https://firebasestorage.googleapis.com https://www.gstatic.com https://images.unsplash.com; media-src 'self' https://firebasestorage.googleapis.com https://*.firebasestorage.app; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net wss://*.firebaseio.com https://images.unsplash.com; frame-src https://accounts.google.com https://*.firebaseapp.com; base-uri 'self';"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&family=Permanent+Marker&family=Caveat:wght@400;500;600;700&family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <ClientProtection />
        <div id="root">{children}</div>
      </body>
    </html>
  )
}
