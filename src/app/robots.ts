import type { MetadataRoute } from 'next'

const siteUrl = 'https://temrevil.com'

export const dynamic = 'force-static'

// One rule for every crawler: everything public is open, search and AI crawlers
// alike. A per-bot "allow /" would say nothing more than this already does.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
