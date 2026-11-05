import type { Metadata, Viewport } from 'next';
import './globals.css';
import { connection } from 'next/server';
import { SiteHeader } from '@/components/site-header';
import { IndicatorStrip } from '@/components/painel-view';
const title = 'SINDI | SINDEPRESTEM';
const description = 'Assistente virtual do SINDEPRESTEM sobre terceirização e trabalho temporário. Protótipo.';
export const metadata: Metadata = {
  metadataBase: new URL('https://sindi-prototipo.vercel.app'),
  title, description,
  robots: { index: false, follow: false },
  openGraph: {
    title, description, siteName: 'SINDI', locale: 'pt_BR', type: 'website',
    url: 'https://sindi-prototipo.vercel.app',
    images: [{ url: '/social/sindi-share-v2.jpg', width: 1200, height: 630, type: 'image/jpeg', alt: 'SINDI, assistente virtual do SINDEPRESTEM. Protótipo.' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/social/sindi-share-v2.jpg'] },
};
/** Largura do aparelho, zoom livre (acessibilidade), conteúdo até as bordas com entalhe (as margens usam a área segura) e teclado virtual que encolhe a página, para a caixa de mensagem continuar visível. */
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#1d1919' }],
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { await connection(); return <html lang="pt-BR" suppressHydrationWarning><body><SiteHeader /><IndicatorStrip />{children}</body></html>; }
