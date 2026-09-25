import type { Metadata } from 'next'

const siteUrl = 'https://temrevil.com'
const pageUrl = `${siteUrl}/book`
const title = 'Book a call | Tem Revil'
const description =
  'Book a free 30 minute Google Meet call with Tem Revil (Mohammed Ahmed), frontend and AI engineer from El Mansoura, Egypt: your project, a role, a collab or a podcast. Pick a time in your own time zone.'
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
    description: 'A free 30 minute Google Meet call. Pick a time in your own time zone.',
    siteName: 'Tem Revil',
    locale: 'en_US',
    images: [image],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book a call with Tem Revil',
    description: 'A free 30 minute Google Meet call. Pick a time in your own time zone.',
    images: [image.url],
  },
  other: {
    subject: 'Book a free 30 minute call with Tem Revil',
    summary:
      'Booking page for Mohammed Ahmed (Tem Revil), frontend and AI engineer. Free 30 minute Google Meet calls about projects, roles, collaborations and podcasts.',
  },
}

// The page body is client-only (ssr:false), so crawlers and AI agents that don't run
// JavaScript learn what /book is and how to use it from this node and the <noscript>
// copy in page.tsx. The Person, WebSite and FAQ nodes live in the root layout; these
// link to them by @id.
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
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
        name: 'Book a free 30 minute call',
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
      name: 'Free 30 minute call with Tem Revil',
      serviceType: 'Consultation call',
      description:
        'A free 30 minute video call on Google Meet with Mohammed Ahmed (Tem Revil) about a project, a role, a collaboration or a podcast. The invite and Meet link are emailed after booking.',
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
    {
      '@type': 'FAQPage',
      '@id': `${pageUrl}#faq`,
      isPartOf: { '@id': `${pageUrl}#webpage` },
      inLanguage: 'en',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How do I book a call with Tem Revil?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Open https://temrevil.com/book, pick an open date on the calendar, choose a time slot (shown in your own time zone), then enter your name, email and what the call is about and press Book. A calendar invite with the Google Meet link is emailed to you.',
          },
        },
        {
          '@type': 'Question',
          name: 'How long is the call and what does it cost?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The call is 30 minutes on Google Meet and it is free.',
          },
        },
        {
          '@type': 'Question',
          name: 'What can the call be about?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'A project you want built, a role you want to offer, a collaboration or a podcast. Tem Revil (Mohammed Ahmed) works on React, Next.js, TypeScript and Firebase frontends and AI product integration.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which time zone are the slots in?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Your own. The page detects your time zone and converts the open slots to it; you can change the time zone from the list above the slots.',
          },
        },
      ],
    },
  ],
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {children}
    </>
  )
}
