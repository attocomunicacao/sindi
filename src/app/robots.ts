import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return { rules: [
    { userAgent: ['WhatsApp', 'facebookexternalhit', 'Facebot'], allow: '/', disallow: ['/api/', '/uso', '/base'] },
    { userAgent: '*', disallow: '/' },
  ] };
}
