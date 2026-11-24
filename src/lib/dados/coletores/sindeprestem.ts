import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { vencido, gravarEstado, gravarDocumento, type BancoDeDados } from '@/lib/dados/db';
import { buscarTexto, buscarComEducacao } from '@/lib/dados/http';
import { pdfParaTexto } from '@/lib/dados/legal';
import { SITE } from '@/lib/base/constantes';
import { categoriaDe, limparTextoDePdf, entradasDeDocumentos, tituloDaEntrada, tipoDe, soTemMes, identificadorDaNorma, secaoDe, tituloPeloTextoDoPdf, anoDe, type SecaoDoSite } from '@/lib/dados/sindicato';
import type { EspelhoDoSite } from '@/lib/base/tipos';
import type { Coletor } from '@/lib/dados/coletores/tipos';

const MAXIMO_DE_BYTES_DO_PDF = 80 * 1024 * 1024;
const HORA_MS = 60 * 60 * 1000;
/** Páginas que listam documentos (PDF) sem rotular os links por nome de arquivo. */
export const PAGINAS_DE_DOCUMENTOS: { path: string; section: SecaoDoSite }[] = [{ path: '/convencoes-coletivas', section: 'convencao' }, { path: '/juridico', section: 'juridico' }, { path: '/cartilhas', section: 'cartilha' }];

const metaDe = (db: BancoDeDados, url: string): Record<string, unknown> | undefined => {
  const linha = db.prepare('SELECT meta FROM documents WHERE url = ?').get(url) as { meta: string | null } | undefined;
  try { return linha?.meta ? JSON.parse(linha.meta) : undefined; } catch { return undefined; }
};
async function baixarPdf(href: string) {
  const response = await buscarComEducacao(href, { minMs: 800 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length') || 0) > MAXIMO_DE_BYTES_DO_PDF) throw new Error('PDF grande demais');
  return limparTextoDePdf(await pdfParaTexto(new Uint8Array(await response.arrayBuffer())));
}
const SEM_TEXTO = 'PDF digitalizado sem texto extraível (reconhecimento óptico pendente). Consulte o documento pelo link.';

/**
 * Rotula os PDFs do site com o título que a página oficial lhes dá (convenção, aditivo, lei, cartilha...), baixando os que ainda não estão na base.
 * Uma vez rotulado, o documento não é sobrescrito pela cópia do coletor de conhecimento (que só conhece o nome do arquivo).
 */
export async function rotularDocumentos(db: BancoDeDados) {
  let buscados = 0; let alterados = 0;
  for (const pagina of PAGINAS_DE_DOCUMENTOS) {
    const urlDaPagina = SITE + pagina.path;
    const entradas = [...new Map(entradasDeDocumentos(await buscarTexto(urlDaPagina)).map(e => [e.href, e])).values()]; buscados++;
    const preparados: { entry: (typeof entradas)[number]; label: string; body: string; meta: Record<string, unknown> }[] = [];
    for (const entrada of entradas) {
      const existente = db.prepare('SELECT content FROM documents WHERE url = ?').get(entrada.href) as { content: string } | undefined;
      let conteudo = existente?.content ? limparTextoDePdf(existente.content) : undefined;
      if (conteudo === undefined) {
        try { conteudo = await baixarPdf(entrada.href); buscados++; } catch { conteudo = ''; }
      }
      const corpo = conteudo.replace(/\s+/g, '').length > 80 ? conteudo : SEM_TEXTO;
      // As páginas de cartilhas não rotulam os links: o título vem do início do texto do PDF.
      let titulo = pagina.section === 'cartilha' ? '' : tituloDaEntrada(entrada);
      if (!titulo) titulo = tituloPeloTextoDoPdf(corpo, `Cartilha do SINDEPRESTEM (${entrada.href.slice(-10, -4)})`);
      // Edições mensais sem nome da norma ("abril de 2024") ganham a identificação lida no próprio PDF.
      if (pagina.section === 'juridico' && (soTemMes(titulo) || !/(decreto|lei|medida|portaria|resolu|instru)/i.test(titulo))) { const norma = identificadorDaNorma(corpo); if (norma) titulo = `${norma} — ${titulo}`; }
      const regiao = entrada.trail.some(t => /jundia[ií]/i.test(t)) && pagina.section === 'convencao' ? 'Jundiaí' : pagina.section === 'convencao' ? 'São Paulo' : undefined;
      const categoria = pagina.section === 'convencao' ? categoriaDe(titulo, corpo) : undefined;
      // Títulos genéricos ("ERRATA", "cct 2025") ganham a categoria identificada no próprio documento.
      const generico = categoria && categoria !== 'Outras' && !new RegExp(categoria.split(' ')[0], 'i').test(titulo);
      const rotulo = `${titulo}${generico ? ` — ${categoria}` : ''}${regiao === 'Jundiaí' ? ' (Jundiaí)' : ''}`;
      const meta: Record<string, unknown> = { kind: 'pdf', section: pagina.section, labeled: true, page: urlDaPagina, context: entrada.trail, ...(pagina.section === 'convencao' ? { category: categoria, year: anoDe(rotulo), type: tipoDe(rotulo), region: regiao } : {}) };
      if (pagina.section === 'juridico') Object.assign(meta, { year: anoDe(rotulo) });
      preparados.push({ entry: entrada, label: rotulo, body: corpo, meta });
    }
    // Documentos com título idêntico (vários "COMUNICADO CONJUNTO - 2026") recebem o código do arquivo para serem distinguíveis.
    const repetidos = new Set(preparados.map(p => p.label).filter((rotulo, i, all) => all.indexOf(rotulo) !== i));
    for (const preparado of preparados) {
      const titulo = repetidos.has(preparado.label) ? `${preparado.label} [arquivo ${preparado.entry.href.slice(-10, -4)}]` : preparado.label;
      if (gravarDocumento(db, { source: 'sindeprestem', url: preparado.entry.href, title: titulo, content: preparado.body, meta: preparado.meta })) alterados++;
    }
  }
  return { fetched: buscados, changed: alterados };
}

/**
 * O site do SINDEPRESTEM já é lido pelo coletor de conhecimento (knowledge:sync, a cada 15 min, com robots.txt e limites próprios).
 * Aqui os documentos ativos são copiados para o mesmo arquivo de dados, classificados por seção, e os PDFs recebem o título oficial.
 */
/**
 * Ligações entre páginas do próprio site (o espelho já as coleta): viram arestas "documento → documento" no grafo do cérebro (src/lib/grafo).
 * Só endereços https do domínio do sindicato, sem consulta nem âncora, até 120 por página.
 */
export function linksDoSite(links: unknown): { links?: string[] } {
  if (!Array.isArray(links)) return {};
  const limpos = [...new Set(links.flatMap(l => {
    try { const u = new URL(String(l)); return u.protocol === 'https:' && /(^|\.)sindeprestem\.com\.br$/.test(u.hostname) ? [`${u.origin}${u.pathname.replace(/\/+$/, '') || '/'}`] : []; } catch { return []; }
  }))].slice(0, 120);
  return limpos.length ? { links: limpos } : {};
}
export const sindeprestem: Coletor = {
  source: 'sindeprestem', label: 'SINDEPRESTEM',
  async run({ db, full }) {
    const espelho: EspelhoDoSite = JSON.parse(await readFile(path.join(process.cwd(), '.data/knowledge/current.json'), 'utf8'));
    let buscados = 0; let alterados = 0;
    db.exec('BEGIN');
    try {
      for (const d of espelho.documents) {
        if (d.status !== 'active') continue; buscados++;
        if (metaDe(db, d.url)?.labeled) continue;
        const conteudo = d.kind === 'pdf' ? limparTextoDePdf(d.content) : d.content;
        const secao = d.kind === 'pdf' ? 'outro' : secaoDe(d.url, d.title, conteudo);
        const listagem = /\/noticias(\/|$)/.test(new URL(d.url).pathname);
        if (gravarDocumento(db, { source: 'sindeprestem', url: d.url, title: d.title, content: conteudo, publishedAt: d.publishedAt, meta: { kind: d.kind, section: secao, ...(listagem ? { listing: true } : {}), ...linksDoSite(d.links) } }, d.fetchedAt)) alterados++;
      }
      db.exec('COMMIT');
    } catch (cause) { db.exec('ROLLBACK'); throw cause; }
    if (vencido(db, 'sindeprestem:labels', 6 * HORA_MS, full)) {
      const rotulados = await rotularDocumentos(db); buscados += rotulados.fetched; alterados += rotulados.changed;
      gravarEstado(db, 'sindeprestem:labels', new Date().toISOString());
    }
    return { fetched: buscados, changed: alterados };
  },
};
