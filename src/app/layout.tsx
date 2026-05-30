import type { Metadata, Viewport } from 'next'
import { Inter, Archivo_Black, Permanent_Marker, Caveat, Kalam } from 'next/font/google'
import './globals.css'
import '../lib/firebase'
import ClientProtection from './ClientProtection'

// ── next/font optimization: self-hosted, subsetted, no render-blocking requests ──
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
})

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
  display: 'swap',
})

const permanentMarker = Permanent_Marker({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-permanent-marker',
  display: 'swap',
})

const caveat = Caveat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-caveat',
  display: 'swap',
})

const kalam = Kalam({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-kalam',
  display: 'swap',
})

const fontVariables = [
  inter.variable,
  archivoBlack.variable,
  permanentMarker.variable,
  caveat.variable,
  kalam.variable,
].join(' ')

const siteUrl = 'https://temrevil.com'
const siteName = 'Tem Revil'
const siteTitle = 'Tem Revil | Portfolio'
const siteDescription =
  'Mohammed Ahmed (Tem Revil) is a frontend engineer and AI engineer based in El Mansoura, Egypt. He specializes in React, Next.js, TypeScript, and Firebase, building motion-rich, accessible web experiences with AI integration. Open to freelance, remote, and full-time opportunities.'

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
      image: `${siteUrl}/icon-512.webp`,
      email: 'mailto:temrevil@gmail.com',
      jobTitle: 'Frontend Engineer & AI Engineer',
      worksFor: {
        '@type': 'Organization',
        name: 'Freelance / Open to Opportunities',
      },
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
      nationality: {
        '@type': 'Country',
        name: 'Egypt',
      },
      sameAs: socialProfiles,
      knowsAbout: [
        'Frontend engineering',
        'React',
        'Next.js',
        'TypeScript',
        'Firebase',
        'Tailwind CSS',
        'Motion design for web interfaces',
        'Framer Motion',
        'Electron apps',
        'AI product integration',
        'Web accessibility',
        'Responsive design',
        'Progressive Web Apps',
      ],
      hasCredential: {
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: 'portfolio',
        url: siteUrl,
      },
      makesOffer: {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Frontend Development & AI Integration',
          description: 'Custom web applications built with React, Next.js, TypeScript, and Firebase. Specializing in motion-rich UI, AI-enhanced features, and performance optimization.',
        },
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      alternateName: ['Tem Revil', 'Temrevil'],
      description: siteDescription,
      inLanguage: 'en',
      creator: { '@id': `${siteUrl}/#person` },
    },
    {
      '@type': 'ProfilePage',
      '@id': `${siteUrl}/#profile`,
      url: siteUrl,
      name: siteTitle,
      description: siteDescription,
      dateModified: new Date().toISOString().split('T')[0],
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#person` },
      primaryImageOfPage: `${siteUrl}/icon-512.webp`,
    },
    {
      '@type': 'ItemList',
      '@id': `${siteUrl}/#skills`,
      name: 'Technical Skills',
      description: 'Core technologies and tools used by Mohammed Ahmed',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'React' },
        { '@type': 'ListItem', position: 2, name: 'Next.js' },
        { '@type': 'ListItem', position: 3, name: 'TypeScript' },
        { '@type': 'ListItem', position: 4, name: 'Firebase' },
        { '@type': 'ListItem', position: 5, name: 'Tailwind CSS' },
        { '@type': 'ListItem', position: 6, name: 'Framer Motion' },
        { '@type': 'ListItem', position: 7, name: 'Node.js' },
        { '@type': 'ListItem', position: 8, name: 'Electron' },
      ],
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
    // Navigational — brand searches
    'Tem Revil',
    'Temrevil',
    'Mohammed Ahmed',
    'Mohammed Ahmed developer',
    'Tem Revil portfolio',
    'Mohammed Ahmed portfolio',
    'temrevil.com',
    // Informational — "who is" / discovery
    'frontend engineer Egypt',
    'frontend engineer El Mansoura',
    'frontend developer El Mansourah',
    'AI engineer Egypt',
    'React developer Egypt',
    'Next.js developer Egypt',
    'TypeScript developer portfolio',
    'web developer El Mansoura',
    'software engineer Dakahlia',
    'frontend developer portfolio examples',
    'React portfolio website',
    // Commercial — hiring intent
    'hire React developer Egypt',
    'hire frontend developer Egypt',
    'freelance frontend developer Egypt',
    'freelance React developer remote',
    'frontend engineer for hire',
    'best frontend developer Egypt',
    // Transactional — direct engagement
    'contact frontend developer Egypt',
    'book frontend developer consultation',
    // Technical / skill-based
    'Firebase developer',
    'Framer Motion developer',
    'motion UI developer',
    'Tailwind CSS developer',
    'Next.js Firebase portfolio',
    'React TypeScript developer',
    'Electron developer Egypt',
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
        url: '/icon-512.webp',
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
    images: ['/icon-512.webp'],
  },
  icons: {
    icon: [
      { url: '/icon-192.webp', sizes: '192x192', type: 'image/webp' },
      { url: '/icon-512.webp', sizes: '512x512', type: 'image/webp' },
    ],
    apple: '/icon-192.webp',
    shortcut: '/icon-192.webp',
  },
  other: {
    'geo.region': 'EG-DK',
    'geo.placename': 'El Mansoura',
    'geo.position': '31.0409;31.3785',
    'ICBM': '31.0409, 31.3785',
    // GEO: Signals for AI content engines
    'subject': 'Frontend Engineer & AI Engineer Portfolio',
    'topic': 'Web Development, React, Next.js, TypeScript, Firebase, AI Integration',
    'summary': 'Portfolio of Mohammed Ahmed (Tem Revil), a frontend and AI engineer from El Mansoura, Egypt, specializing in React, Next.js, and motion-rich web experiences.',
    // (Removed legacy meta tags no modern search engine honors:
    //  classification / pagetype / coverage / distribution / rating / revisit-after.)
  },
  category: 'technology',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // React's DEV mode requires eval() for HMR / debugging (it never uses eval in production).
  // So allow 'unsafe-eval' ONLY in development; production stays locked down (no eval).
  // This is a build-time conditional — `next build` sets NODE_ENV=production, so the
  // shipped static export NEVER includes 'unsafe-eval'.
  const scriptSrc =
    process.env.NODE_ENV === 'development'
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.gstatic.com https://www.google.com"
      : "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.gstatic.com https://www.google.com";
  const csp = `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com https://firebasestorage.googleapis.com https://www.gstatic.com https://images.unsplash.com https://avatars.githubusercontent.com; media-src 'self' https://firebasestorage.googleapis.com https://*.firebasestorage.app; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.a.run.app wss://*.firebaseio.com https://www.google.com https://images.unsplash.com https://github-contributions-api.jogruber.de https://github.com https://api.github.com; frame-src https://accounts.google.com https://*.firebaseapp.com https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`;

  return (
    <html lang="en" className={`dark ${fontVariables}`}>
      <head>
        {/* Google Search Console verification */}
        <meta name="google-site-verification" content="uQR0p6nF_uFGSNYBtO-_tKpQ6W-Qu_LrwF77SLoEprc" />
        {/* Content Security Policy — defense-in-depth against XSS.
            'unsafe-eval' is dev-only (see scriptSrc above); production omits it.
            'frame-ancestors none' blocks clickjacking (note: only enforced when CSP is
            delivered as an HTTP header — keep the .htaccess header as the authoritative copy). */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={csp}
        />
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
