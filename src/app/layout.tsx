import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './fonts.css'
import './globals.css'
import ClientProtection from './ClientProtection'
import { LITE_SCRIPT } from '../lib/device'
import { SITE_URL as siteUrl, SITE_NAME as siteName, SITE_TITLE as siteTitle, SITE_DESCRIPTION as siteDescription, SHARE_CARD } from '../utils/siteProfile'

// The JSON-LD lives with each page (see src/utils/siteProfile.ts), not here: a layout
// prints on every page, and the homepage's profile node doesn't belong on /book.

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
    // Navigational - brand searches
    'Tem Revil',
    'Temrevil',
    'Mohammed Ahmed',
    'Mohammed Ahmed developer',
    'Tem Revil portfolio',
    'Mohammed Ahmed portfolio',
    'temrevil.com',
    // Informational - "who is" / discovery
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
    // Commercial - hiring intent
    'hire React developer Egypt',
    'hire frontend developer Egypt',
    'freelance frontend developer Egypt',
    'freelance React developer remote',
    'frontend engineer for hire',
    'best frontend developer Egypt',
    // Transactional - direct engagement
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
    images: [SHARE_CARD],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [SHARE_CARD.url],
  },
  icons: {
    icon: [
      // SVG first: modern browsers use it as a crisp, scalable favicon.
      { url: '/icon.svg', type: 'image/svg+xml' },
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
    'subject': 'Frontend & AI Engineer Portfolio',
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
  // This is a build-time conditional - `next build` sets NODE_ENV=production, so the
  // shipped static export NEVER includes 'unsafe-eval'.
  const scriptSrc =
    process.env.NODE_ENV === 'development'
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.gstatic.com https://www.google.com"
      : "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.gstatic.com https://www.google.com";
  const csp = `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com https://firebasestorage.googleapis.com https://www.gstatic.com https://images.unsplash.com https://avatars.githubusercontent.com; media-src 'self' https://firebasestorage.googleapis.com https://*.firebasestorage.app; connect-src 'self' https://mcp.temrevil.com https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.a.run.app wss://*.firebaseio.com https://www.google.com https://images.unsplash.com https://github-contributions-api.jogruber.de https://github.com https://api.github.com https://open.er-api.com https://api.anthropic.com https://api.openai.com; frame-src https://accounts.google.com https://*.firebaseapp.com https://www.google.com; base-uri 'self'; form-action 'self' https://*.cloudfunctions.net https://*.a.run.app;`;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Theme - applied BEFORE first paint so the whole app (incl. the dashboard,
            which doesn't mount the Navbar) reflects the saved/system preference on
            every refresh with no flash. The Navbar's toggle keeps writing
            localStorage('theme'); this just reads it (or the OS preference) early.
            next/script beforeInteractive → injected into the initial HTML head
            (no React "script won't execute on client" warning). */}
        <Script id="theme-init" strategy="beforeInteractive">
          {"(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;if(d){c.add('dark');}else{c.remove('dark');}}catch(e){}})();"}
        </Script>
        {/* Phones run lite (see lib/device.ts): marked before the first paint, so the CSS
            drops the costly effects without waiting for React. */}
        <Script id="lite-init" strategy="beforeInteractive">{LITE_SCRIPT}</Script>
        {/* Canonical-domain redirect: forward GitHub Pages (temrevil.github.io/revil)
            visitors to temrevil.com. Path after /revil (e.g. a link code) and query/hash
            are kept. No-op on temrevil.com itself (hostname check fails). */}
        <Script id="canonical-redirect" strategy="beforeInteractive">
          {"(function(){try{if(location.hostname==='temrevil.github.io'){var p=location.pathname;if(p==='/revil'){p='/';}else if(p.indexOf('/revil/')===0){p=p.slice(6);}location.replace('https://temrevil.com'+p+location.search+location.hash);}}catch(e){}})();"}
        </Script>
        {/* Google Search Console verification */}
        <meta name="google-site-verification" content="uQR0p6nF_uFGSNYBtO-_tKpQ6W-Qu_LrwF77SLoEprc" />
        {/* Content Security Policy - defense-in-depth against XSS.
            'unsafe-eval' is dev-only (see scriptSrc above); production omits it.
            NOTE: 'frame-ancestors' is intentionally NOT here - browsers ignore it in a
            <meta> tag (and log a warning). Clickjacking protection is delivered as a real
            HTTP header (Content-Security-Policy: frame-ancestors + X-Frame-Options) from
            deploy/hostinger/.htaccess instead. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={csp}
        />
        {/* The three faces the first screen draws with (fonts.css). */}
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/archivo-black-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/permanent-marker-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <ClientProtection />
        <div id="root">{children}</div>
      </body>
    </html>
  )
}
