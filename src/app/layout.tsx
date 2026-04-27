/* eslint-disable react-refresh/only-export-components */
import type { Metadata, Viewport } from 'next'
import './globals.css'
import '../lib/firebase'
import ClientProtection from './ClientProtection'

const siteUrl = 'https://temrevil.com'
const siteName = 'Tem Revil'
const siteTitle = 'Tem Revil | Portfolio'
const siteDescription =
  'Tem Revil is the portfolio of Mohammed Ahmed, a frontend and AI engineer in El Mansoura, Egypt, building React, Next.js, TypeScript, Firebase, motion-rich UI, and AI-enhanced web experiences.'

const socialProfiles = [
  'https://github.com/TemRevil',
  'https://linkedin.com/in/temrevil',
  'https://instagram.com/temrevil',
]

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': `${siteUrl}/#person`,
      name: 'Mohammed Ahmed',
      alternateName: ['Tem Revil', 'Temrevil', 'Tem', 'Tim'],
      description: siteDescription,
      url: siteUrl,
      image: `${siteUrl}/icon-512.png`,
      email: 'mailto:temrevil@gmail.com',
      jobTitle: 'Frontend Engineer and AI Engineer',
      homeLocation: {
        '@type': 'Place',
        name: 'El Mansoura, Dakahlia, Egypt',
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'El Mansoura',
        addressRegion: 'Dakahlia',
        addressCountry: 'EG',
      },
      sameAs: socialProfiles,
      knowsAbout: [
        'Frontend engineering',
        'React',
        'Next.js',
        'TypeScript',
        'Firebase',
        'Motion design for web interfaces',
        'Electron apps',
        'AI product integration',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      alternateName: ['Tem Revil', 'Temrevil'],
      description: siteDescription,
      inLanguage: 'en',
    },
    {
      '@type': 'ProfilePage',
      '@id': `${siteUrl}/#profile`,
      url: siteUrl,
      name: siteTitle,
      description: siteDescription,
      isPartOf: {
        '@id': `${siteUrl}/#website`,
      },
      about: {
        '@id': `${siteUrl}/#person`,
      },
      primaryImageOfPage: `${siteUrl}/icon-512.png`,
    },
  ],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#08090d',
  colorScheme: 'dark light',
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    'Tem Revil',
    'Temrevil',
    'Mohammed Ahmed',
    'Tem',
    'Tim',
    'frontend engineer in El Mansoura',
    'frontend developer in El Mansourah',
    'AI engineer in Egypt',
    'React developer Egypt',
    'Next.js developer El Mansoura',
    'Tem Revil portfolio',
    'Mohammed Ahmed portfolio',
  ],
  authors: [{ name: 'Mohammed Ahmed', url: siteUrl }],
  creator: 'Mohammed Ahmed',
  publisher: siteName,
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'profile',
    url: siteUrl,
    title: siteTitle,
    description: siteDescription,
    siteName,
    locale: 'en_US',
    images: [
      {
        url: '/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Tem Revil brand icon',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/icon-512.png'],
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
    shortcut: '/icon-192.png',
  },
  other: {
    'geo.region': 'EG-DK',
    'geo.placename': 'El Mansoura',
  },
  category: 'technology',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>
        <ClientProtection />
        <div id="root">{children}</div>
      </body>
    </html>
  )
}
