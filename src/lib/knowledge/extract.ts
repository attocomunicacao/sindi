import { load } from 'cheerio';
import { SITE } from './core';
export function siteUrl(value: string, base = SITE): string | null {
  try {
    const u = new URL(value, base);
    if (!['www.sindeprestem.com.br', 'sindeprestem.com.br'].includes(u.hostname) || u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    u.hostname = 'www.sindeprestem.com.br'; u.hash = ''; u.search = '';
    if (/\.(?:png|jpg|jpeg|gif|svg|webp|css|js|zip|mp4)$/i.test(u.pathname) || /\/_partials|\/pro-gallery/.test(u.pathname)) return null;
    u.pathname = u.pathname.replace(/\/$/, '') || '/';
    return u.href.replace(/\/$/, '');
  } catch { return null; }
}
export function pdfUrl(value: string, base = SITE): string | null {
  try {
    const u = new URL(value, base);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !/\.pdf$/i.test(u.pathname)) return null;
    if (!['www.sindeprestem.com.br', 'sindeprestem.com.br', 'docs.wixstatic.com', 'www.sindeprestem.org.br'].includes(u.hostname)) return null;
    u.hash = ''; return u.href;
  } catch { return null; }
}
export function extractHtml(html: string, url: string) {
  const $ = load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').text() || url;
  let publishedAt = $('meta[property="article:published_time"]').attr('content');
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const obj = JSON.parse($(el).text());
      const nodes = Array.isArray(obj) ? obj : obj['@graph'] || [obj];
      for (const node of nodes) if (node.datePublished && !publishedAt) publishedAt = node.datePublished;
    } catch { /* Malformed structured data cannot become instructions. */ }
  });
  const links = [...new Set($('a[href]').map((_, el) => $(el).attr('href') || '').get()
    .map(href => pdfUrl(href, url) || siteUrl(href, url)).filter((u): u is string => Boolean(u)))];
  const external = [...new Set($('a[href]').map((_, el) => $(el).attr('href') || '').get()
    .filter(href => /^https?:/.test(href) && !siteUrl(href, url) && !pdfUrl(href, url)))];
  $('script,style,noscript,nav,header,footer,form,button,svg,[role="navigation"],[hidden],[aria-hidden="true"]').remove();
  $('br').replaceWith('\n'); $('p,h1,h2,h3,h4,li,section,article,div').append('\n');
  const main = $('main').first();
  const content = (main.length ? main.text() : $('body').text()).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  // Contact details in the official footer are relevant and kept separately.
  const original = load(html);
  const footerText = original('footer').text().replace(/\s+/g, ' ').trim();
  return { title: title.trim(), content: content + (footerText && !content.includes('Av. São Luís') ? `\n\nRodapé institucional: ${footerText}` : ''), links, external,
    publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : undefined };
}
