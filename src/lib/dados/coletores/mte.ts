import { enfileirar, temDocumento, marcarBuscado, proximosDaFila, gravarDocumento } from '@/lib/dados/db';
import { extrairArtigo, linksDe } from '@/lib/dados/html';
import { buscarTexto, buscarComEducacao } from '@/lib/dados/http';
import { pdfParaTexto } from '@/lib/dados/legal';
import type { Coletor } from '@/lib/dados/coletores/tipos';

const RAIZ = 'https://www.gov.br/trabalho-e-emprego/pt-br';
const NOTICIAS = `${RAIZ}/noticias-e-conteudo`;
const ASSUNTOS = `${RAIZ}/assuntos`;

/** Seções rastreadas: assuntos do Ministério e a Comissão Tripartite Paritária Permanente, onde ficam as Normas Regulamentadoras. */
const PREFIXOS_DE_ASSUNTO = ['/trabalho-e-emprego/pt-br/assuntos', '/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente'];
export const ehNoticia = (u: URL) => u.hostname === 'www.gov.br' && /^\/trabalho-e-emprego\/pt-br\/noticias-e-conteudo\/\d{4}\/[a-zç]+\/[^/]+$/i.test(u.pathname);
/** Páginas de conteúdo do portal (assuntos, normas, serviços); sem arquivos, buscas nem parâmetros. */
export function ehPaginaDeAssunto(u: URL) {
  return u.hostname === 'www.gov.br' && PREFIXOS_DE_ASSUNTO.some(prefix => u.pathname.startsWith(prefix)) && !/\.(pdf|docx?|xlsx?|zip|png|jpe?g|gif|svg|mp4|csv|odt)(\/|$)/i.test(u.pathname) && !/\/(view|download|image_view|at_download|@@images)(\/|$)|\/img\//i.test(u.pathname) && !u.search;
}
const limparUrl = (u: URL) => { u.search = ''; u.hash = ''; return u.href.replace(/\/$/, ''); };
export function lerPaginaGovBr(html: string) {
  const artigo = extrairArtigo(html, { containers: ['#content-core', '#parent-fieldname-text', '.documentContent', '#content'] });
  return { ...artigo, title: artigo.title.replace(/\s*[—–|-]\s*Minist[ée]rio do Trabalho e Emprego\s*$/i, '').trim() };
}
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const MAXIMO_DE_BYTES_DO_PDF = 25 * 1024 * 1024;
/** Algumas páginas do portal (como a NR-1) entregam diretamente um PDF: o texto é extraído em vez de tratar os bytes como HTML. */
export async function buscarPagina(url: string): Promise<{ html?: string; pdfText?: string }> {
  const response = await buscarComEducacao(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(url).host}`);
  if (/application\/pdf/i.test(response.headers.get('content-type') ?? '')) {
    if (Number(response.headers.get('content-length') || 0) > MAXIMO_DE_BYTES_DO_PDF) throw new Error('PDF grande demais');
    return { pdfText: (await pdfParaTexto(new Uint8Array(await response.arrayBuffer()))).slice(0, 400000) };
  }
  return { html: await response.text() };
}
/** Título legível a partir do endereço de uma NR ("norma-regulamentadora-no-01-nr-01" vira "Norma Regulamentadora No. 1 (NR-1)"). */
export function tituloPeloEndereco(url: string) {
  const trecho = new URL(url).pathname.split('/').pop() ?? '';
  const nr = trecho.match(/norma-regulamentadora-no-0*(\d+)-nr/);
  return nr ? `Norma Regulamentadora No. ${nr[1]} (NR-${nr[1]})` : trecho.replace(/-/g, ' ');
}

/**
 * Portal do Ministério do Trabalho e Emprego. Notícias: páginas de listagem e artigos novos a cada ciclo.
 * Assuntos (NRs, normas, serviços): rastreamento gradual por fila, poucas páginas por ciclo, revisadas a cada 7 dias.
 */
export const mte: Coletor = {
  source: 'mte', label: 'Ministério do Trabalho e Emprego',
  async run({ db, full }) {
    let buscados = 0; let alterados = 0;
    const noticias: string[] = [];
    for (let pagina = 0; pagina < (full ? 30 : 1); pagina++) {
      const html = await buscarTexto(pagina ? `${NOTICIAS}?b_start:int=${pagina * 30}` : NOTICIAS); buscados++;
      const achados = linksDe(html, NOTICIAS, ehNoticia); if (!achados.length) break;
      noticias.push(...achados);
    }
    for (const url of [...new Set(noticias)].filter(u => !temDocumento(db, u)).slice(0, full ? 400 : 20)) {
      const artigo = lerPaginaGovBr(await buscarTexto(url)); buscados++;
      if (artigo.content.length < 100) continue;
      if (gravarDocumento(db, { source: 'mte', url, title: artigo.title, content: artigo.content, publishedAt: artigo.publishedAt, meta: { kind: 'noticia' } })) alterados++;
    }
    enfileirar(db, 'mte', [ASSUNTOS, `${RAIZ}/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras`]);
    const obsoleto = new Date(Date.now() - 7 * UM_DIA_MS).toISOString();
    // Orçamento de páginas por ciclo; as páginas descobertas durante o ciclo entram na fila e são lidas no mesmo ciclo enquanto houver orçamento.
    let orcamento = full ? 400 : 12; let falhas = 0;
    while (orcamento > 0) {
      const lote = proximosDaFila(db, 'mte', Math.min(orcamento, 25), obsoleto);
      if (!lote.length) break;
      orcamento -= lote.length;
      for (const url of lote) {
        let pagina: { html?: string; pdfText?: string };
        try { pagina = await buscarPagina(url); buscados++; falhas = 0; }
        catch (cause) {
          // Falha isolada de uma página (rede, 404) não derruba o rastreamento; a página volta à fila em 7 dias. Falhas seguidas indicam bloqueio ou queda.
          marcarBuscado(db, url);
          if (++falhas >= 8) throw cause;
          continue;
        }
        marcarBuscado(db, url);
        try {
          if (pagina.pdfText !== undefined) {
            if (pagina.pdfText.length > 150 && gravarDocumento(db, { source: 'mte', url, title: tituloPeloEndereco(url), content: pagina.pdfText, meta: { kind: 'assunto', format: 'pdf' } })) alterados++;
            continue;
          }
          enfileirar(db, 'mte', linksDe(pagina.html!, url, ehPaginaDeAssunto).map(l => limparUrl(new URL(l))));
          const lida = lerPaginaGovBr(pagina.html!);
          if (lida.content.length < 150) continue;
          if (gravarDocumento(db, { source: 'mte', url, title: lida.title, content: lida.content, publishedAt: lida.publishedAt, meta: { kind: 'assunto' } })) alterados++;
        } catch { /* uma página que não pode ser lida não interrompe o rastreamento */ }
      }
    }
    return { fetched: buscados, changed: alterados };
  },
};
