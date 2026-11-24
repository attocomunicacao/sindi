import { buscarTexto } from '@/lib/dados/http';
import { extrairArtigo, linksDe } from '@/lib/dados/html';
import { temDocumento, gravarDocumento } from '@/lib/dados/db';
import type { Coletor } from '@/lib/dados/coletores/tipos';

const PAGINA_INICIAL = 'https://www.tst.jus.br/noticias';
const ehArtigo = (u: URL) => u.hostname === 'www.tst.jus.br' && /^\/-\/[^/]+$/.test(u.pathname);
const ehPaginaDoIndice = (u: URL) =>
  u.hostname === 'www.tst.jus.br' &&
  u.pathname === '/noticias' &&
  u.searchParams.has('p_p_id') &&
  /_cur=\d+/.test(u.search);
const numeroDaPagina = (u: string) => Number(u.match(/_cur=(\d+)/)?.[1] || 0);

export function lerNoticiaDoTst(html: string) {
  return extrairArtigo(html, { containers: ['.news-body', '.materia'], dateText: '.date-info' });
}
export const tst: Coletor = {
  source: 'tst',
  label: 'Tribunal Superior do Trabalho',
  async run({ db, full }) {
    let buscados = 0;
    let alterados = 0;
    const primeira = await buscarTexto(PAGINA_INICIAL);
    buscados++;
    const fila = linksDe(primeira, PAGINA_INICIAL, ehArtigo);
    if (full) {
      const paginas = linksDe(primeira, PAGINA_INICIAL, ehPaginaDoIndice)
        .sort((a, b) => numeroDaPagina(a) - numeroDaPagina(b))
        .slice(1, 30);
      for (const pagina of paginas) {
        fila.push(...linksDe(await buscarTexto(pagina), pagina, ehArtigo));
        buscados++;
      }
    }
    // Só baixa páginas novas: cada ciclo de 30 minutos custa uma página de índice e poucos artigos.
    const pendentes = [...new Set(fila)].filter((url) => !temDocumento(db, url)).slice(0, full ? 300 : 25);
    for (const url of pendentes) {
      const artigo = lerNoticiaDoTst(await buscarTexto(url));
      buscados++;
      if (artigo.content.length < 80) continue;
      if (
        gravarDocumento(db, {
          source: 'tst',
          url,
          title: artigo.title.replace(/ - TST$/, ''),
          content: artigo.content,
          publishedAt: artigo.publishedAt,
        })
      )
        alterados++;
    }
    return { fetched: buscados, changed: alterados };
  },
};
