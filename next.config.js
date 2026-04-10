/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The pipeline writes a ~10 MB patents.json. Allow large imports.
  experimental: {
    largePageDataBytes: 128 * 1024 * 1024,
  },
};

module.exports = nextConfig;
