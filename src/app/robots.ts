import type { MetadataRoute } from 'next';
import { rotasSemPrevia } from '@/lib/paginas';

// Só os rastreadores de prévia de link (WhatsApp, redes sociais) podem ler o site, e não as páginas marcadas sem prévia no registro (src/lib/paginas.ts); os demais ficam de fora.
export default function robots(): MetadataRoute.Robots {
  return { rules: [
    { userAgent: ['WhatsApp', 'facebookexternalhit', 'Facebot'], allow: '/', disallow: ['/api/', ...rotasSemPrevia()] },
    { userAgent: '*', disallow: '/' },
  ] };
}
