import { load } from 'cheerio';
import { SITE } from '@/lib/base/constantes';
export function urlDoSite(valor: string, base = SITE): string | null {
  try {
    const u = new URL(valor, base);
    if (
      !['www.sindeprestem.com.br', 'sindeprestem.com.br'].includes(u.hostname) ||
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port
    )
      return null;
    u.hostname = 'www.sindeprestem.com.br';
    u.hash = '';
    u.search = '';
    if (
      /\.(?:png|jpg|jpeg|gif|svg|webp|css|js|zip|mp4)$/i.test(u.pathname) ||
      /\/_partials|\/pro-gallery/.test(u.pathname)
    )
      return null;
    u.pathname = u.pathname.replace(/\/$/, '') || '/';
    return u.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}
export function urlDoPdf(valor: string, base = SITE): string | null {
  try {
    const u = new URL(valor, base);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !/\.pdf$/i.test(u.pathname)) return null;
    if (
      !['www.sindeprestem.com.br', 'sindeprestem.com.br', 'docs.wixstatic.com', 'www.sindeprestem.org.br'].includes(
        u.hostname,
      )
    )
      return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}
export function extrairHtml(html: string, url: string) {
  const $ = load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').text() || url;
  let publishedAt = $('meta[property="article:published_time"]').attr('content');
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const objeto = JSON.parse($(el).text());
      const nos = Array.isArray(objeto) ? objeto : objeto['@graph'] || [objeto];
      for (const no of nos) if (no.datePublished && !publishedAt) publishedAt = no.datePublished;
    } catch {
      /* Dado estruturado malformado não vira instrução. */
    }
  });
  const links = [
    ...new Set(
      $('a[href]')
        .map((_, el) => $(el).attr('href') || '')
        .get()
        .map((href) => urlDoPdf(href, url) || urlDoSite(href, url))
        .filter((u): u is string => Boolean(u)),
    ),
  ];
  const externos = [
    ...new Set(
      $('a[href]')
        .map((_, el) => $(el).attr('href') || '')
        .get()
        .filter((href) => /^https?:/.test(href) && !urlDoSite(href, url) && !urlDoPdf(href, url)),
    ),
  ];
  $(
    'script,style,noscript,nav,header,footer,form,button,svg,[role="navigation"],[hidden],[aria-hidden="true"]',
  ).remove();
  $('br').replaceWith('\n');
  $('p,h1,h2,h3,h4,li,section,article,div').append('\n');
  const principal = $('main').first();
  const conteudo = (principal.length ? principal.text() : $('body').text())
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Os contatos do rodapé oficial são relevantes e ficam separados.
  const original = load(html);
  const textoDoRodape = original('footer').text().replace(/\s+/g, ' ').trim();
  return {
    title: title.trim(),
    content:
      conteudo +
      (textoDoRodape && !conteudo.includes('Av. São Luís') ? `\n\nRodapé institucional: ${textoDoRodape}` : ''),
    links,
    external: externos,
    publishedAt:
      publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : undefined,
  };
}
