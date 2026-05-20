/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@expensehub/shared'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
};
module.exports = nextConfig;
