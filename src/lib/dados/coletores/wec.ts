import { buscarTexto } from '@/lib/dados/http';
import { extrairArtigo, entradasDoSitemap } from '@/lib/dados/html';
import { gravarDocumento } from '@/lib/dados/db';
import type { Coletor } from '@/lib/dados/coletores/tipos';

/** World Employment Confederation: um sitemap por tipo de conteúdo (WordPress/Yoast). */
export const MAPAS_DO_SITE_WEC = ['news', 'press_release', 'publication', 'event', 'opinion_piece'];

export const wec: Coletor = {
  source: 'wec', label: 'World Employment Confederation',
  async run({ db, full }) {
    let buscados = 0; let alterados = 0;
    for (const tipo of MAPAS_DO_SITE_WEC) {
      const entradas = entradasDoSitemap(await buscarTexto(`https://wecglobal.org/${tipo}-sitemap.xml`)); buscados++;
      const conhecidos = new Map((db.prepare("SELECT url, fetched_at FROM documents WHERE source = 'wec'").all() as { url: string; fetched_at: string }[]).map(r => [r.url, r.fetched_at]));
      // Baixa páginas novas ou alteradas desde a última coleta, das mais recentes para as mais antigas.
      const pendentes = entradas.filter(e => !conhecidos.has(e.url) || (e.lastmod && e.lastmod > conhecidos.get(e.url)!)).slice(0, full ? 150 : 15);
      for (const entrada of pendentes) {
        const resposta = await buscarTexto(entrada.url); buscados++;
        const artigo = extrairArtigo(resposta);
        if (artigo.content.length < 80) continue;
        if (gravarDocumento(db, { source: 'wec', url: entrada.url, title: artigo.title.replace(/^World Employment Confederation\s*[-–|]\s*/, ''), content: artigo.content, publishedAt: artigo.publishedAt ?? (entrada.lastmod || undefined), meta: { type: tipo } })) alterados++;
      }
    }
    return { fetched: buscados, changed: alterados };
  },
};
