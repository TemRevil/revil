import type { Metadata } from 'next'
import { preload } from 'react-dom'
import { baseGraph, jsonLd } from '../../lib/siteProfile'

const siteUrl = 'https://temrevil.com'
const pageUrl = `${siteUrl}/book`
const title = 'Book a call | Tem Revil'
const description =
  'Book a free 60 minute Google Meet call with Tem Revil (Mohammed Ahmed), frontend and AI engineer from El Mansoura, Egypt: your project, a role, a collab or a podcast. Pick a time in your own time zone.'
const image = { url: '/book/tem-cutout.webp', width: 920, height: 1286, alt: 'Tem Revil (Mohammed Ahmed)' }

// Nested metadata replaces the root's openGraph/twitter objects wholesale, so every
// field the root sets (siteName, type, images...) is repeated here.
export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'book a call with Tem Revil',
    'Tem Revil consultation',
    'Mohammed Ahmed meeting',
    'hire frontend developer Egypt',
    'hire React developer',
    'hire AI engineer',
    'free consultation web developer',
    'book frontend developer consultation',
    'Google Meet call',
  ],
  alternates: { canonical: '/book' },
  openGraph: {
    type: 'website',
    url: pageUrl,
    title: 'Book a call with Tem Revil',
    description: 'A free 60 minute Google Meet call. Pick a time in your own time zone.',
    siteName: 'Tem Revil',
    locale: 'en_US',
    images: [image],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book a call with Tem Revil',
    description: 'A free 60 minute Google Meet call. Pick a time in your own time zone.',
    images: [image.url],
  },
  other: {
    subject: 'Book a free 60 minute call with Tem Revil',
    summary:
      'Booking page for Mohammed Ahmed (Tem Revil), frontend and AI engineer. Free 60 minute Google Meet calls about projects, roles, collaborations and podcasts.',
  },
}

// The page body is client-only (ssr:false), so crawlers and AI agents that don't run
// JavaScript learn what /book is and how to use it from this node and the <noscript>
// copy in page.tsx. The Person and WebSite nodes come from siteProfile, so the page's
// graph is whole. No FAQPage: Google wants FAQ questions visible on the page and only
// shows FAQ results for government and health sites; the noscript copy says it all.
const graph = [
    ...baseGraph,
    {
      '@type': ['WebPage', 'ContactPage'],
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: title,
      description,
      inLanguage: 'en',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#person` },
      primaryImageOfPage: `${siteUrl}${image.url}`,
      breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      mainEntity: { '@id': `${pageUrl}#service` },
      potentialAction: {
        '@type': 'ScheduleAction',
        name: 'Book a free 60 minute call',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: pageUrl,
          actionPlatform: [
            'https://schema.org/DesktopWebPlatform',
            'https://schema.org/MobileWebPlatform',
          ],
        },
        object: { '@id': `${pageUrl}#service` },
      },
    },
    {
      '@type': 'Service',
      '@id': `${pageUrl}#service`,
      name: 'Free 60 minute call with Tem Revil',
      serviceType: 'Consultation call',
      description:
        'A free 60 minute video call on Google Meet with Mohammed Ahmed (Tem Revil) about a project, a role, a collaboration or a podcast. The invite and Meet link are emailed after booking.',
      provider: { '@id': `${siteUrl}/#person` },
      areaServed: 'Worldwide',
      availableChannel: {
        '@type': 'ServiceChannel',
        serviceUrl: pageUrl,
        availableLanguage: 'English',
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: pageUrl,
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Tem Revil', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Book a call', item: pageUrl },
      ],
    },
]

export default function BookLayout({ children }: { children: React.ReactNode }) {
  // The cutout is the page's largest paint, but the client-only page only asks for it once
  // its JavaScript has run. Announcing it in the HTML head lets it download alongside that.
  preload(image.url, { as: 'image', fetchPriority: 'high' })
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(graph) }}
      />
      {children}
    </>
  )
}
