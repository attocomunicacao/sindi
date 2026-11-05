import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: '/api/biblioteca/pdf/:id', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] }, { source: '/((?!api/biblioteca/pdf/).*)', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }, { source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default config;
