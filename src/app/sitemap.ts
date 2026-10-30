import type { MetadataRoute } from 'next'
import { projectPages } from '../lib/projectPages'

const siteUrl = 'https://temrevil.com'

export const dynamic = 'force-static'

// No lastModified: the build time is not when a page changed, and a sitemap that
// stamps every URL with each deploy teaches Google to ignore the field.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/book`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/projects`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...projectPages.map((p) => ({
      url: `${siteUrl}/projects/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
