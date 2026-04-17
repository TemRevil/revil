/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'dist',
  images: {
    unoptimized: true,
  },
  basePath: process.env.GITHUB_ACTIONS ? '/revil' : '',
  assetPrefix: process.env.GITHUB_ACTIONS ? '/revil/' : '',
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
