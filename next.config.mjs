/** @type {import('next').NextConfig} */
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') || ''

const nextConfig = {
  output: 'export',
  distDir: 'dist',
  // NOTE: no `images` block — `output: 'export'` disables the Next image optimizer,
  // and the app uses a custom <FileImage> instead of next/image, so any images config
  // would be a no-op. (sharp was also removed from deps for the same reason.)
  ...(configuredBasePath
    ? {
        basePath: configuredBasePath,
        assetPrefix: `${configuredBasePath}/`,
      }
    : {}),
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig
