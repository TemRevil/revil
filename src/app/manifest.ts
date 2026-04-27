import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tem Revil',
    short_name: 'Tem Revil',
    description:
      'Portfolio of Mohammed Ahmed (Tem Revil), a frontend and AI engineer based in El Mansoura, Egypt.',
    start_url: '/',
    display: 'standalone',
    background_color: '#08090d',
    theme_color: '#08090d',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
