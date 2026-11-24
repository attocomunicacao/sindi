import { load } from 'cheerio';
import { apagarAusentes, vencido, lerEstado, gravarEstado, gravarDocumento, type BancoDeDados } from '@/lib/dados/db';
import { buscarTexto, buscarComEducacao } from '@/lib/dados/http';
import { pdfParaTexto, dividirArtigos } from '@/lib/dados/legal';
import type { Coletor } from '@/lib/dados/coletores/tipos';

const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const MAXIMO_DE_BYTES_DO_PDF = 40 * 1024 * 1024;
type RegimentoColetado = { key: string; name: string; page: string; pick: (links: { text: string; href: string }[]) => { text: string; href: string }[] };
const somentePdfs = (links: { text: string; href: string }[]) => links.filter(l => /\.pdf(\/|$|\?)/i.test(l.href));

/**
 * Os PDFs oficiais mudam de nome a cada atualização; por isso o link é lido da página oficial de cada casa.
 * Câmara: portal www2 (sem restrição a robôs). Senado e Congresso: página oficial do Regimento no portal do Senado.
 */
export const REGIMENTOS: RegimentoColetado[] = [
  { key: 'ricd', name: 'Regimento Interno da Câmara dos Deputados', page: 'https://www2.camara.leg.br/atividade-legislativa/legislacao/regimento-interno-da-camara-dos-deputados',
    pick: links => somentePdfs(links).filter(l => /RICD/i.test(l.href)).slice(0, 1) },
  { key: 'risf', name: 'Regimento Interno do Senado Federal', page: 'https://www25.senado.leg.br/web/atividade/legislacao/regimento-interno',
    pick: links => somentePdfs(links).filter(l => /RISF/i.test(l.href)) },
  { key: 'rccn', name: 'Regimento Comum do Congresso Nacional', page: 'https://www25.senado.leg.br/web/atividade/legislacao/regimento-interno',
    pick: links => somentePdfs(links).filter(l => /RCCN/i.test(l.href)).slice(0, 1) },
];
export function linksDePdf(html: string, base: string) {
  const $ = load(html); const saida: { text: string; href: string }[] = [];
  $('a[href]').each((_, el) => { try { saida.push({ text: $(el).text().replace(/\s+/g, ' ').trim(), href: new URL($(el).attr('href') || '', base).href }); } catch { /* ignora */ } });
  return saida;
}
async function ingerir(db: BancoDeDados, regimento: RegimentoColetado, href: string, indice: number, forcar: boolean) {
  const chaveDeEstado = `regimento:${regimento.key}:${indice}`;
  const anterior = lerEstado(db, chaveDeEstado)?.value;
  const resposta = await buscarComEducacao(href, { headers: anterior && !forcar ? { 'If-None-Match': anterior.split('|')[0] || '', 'If-Modified-Since': anterior.split('|')[1] || '' } : {} });
  if (resposta.status === 304) return { fetched: 1, changed: 0 };
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${new URL(href).host}`);
  if (Number(resposta.headers.get('content-length') || 0) > MAXIMO_DE_BYTES_DO_PDF) throw new Error('PDF grande demais');
  const texto = await pdfParaTexto(new Uint8Array(await resposta.arrayBuffer()));
  const artigos = dividirArtigos(texto, { maxChars: 8000 });
  // Partes secundárias (anexos, índices de normas conexas) podem não ter artigos; só a principal precisa estar completa.
  if (artigos.length < 30) { if (indice === 0) throw new Error(`Extração suspeita em ${regimento.key}: ${artigos.length} artigos`); return { fetched: 1, changed: 0 }; }
  const volume = indice > 0 ? ` (parte ${indice + 1})` : '';
  let alterados = 0;
  for (const a of artigos) {
    if (gravarDocumento(db, { source: 'regimentos', url: `${href}#${a.key}`, title: `${regimento.name}${volume} — ${a.label}`, content: a.content, meta: { regiment: regimento.key } })) alterados++;
  }
  apagarAusentes(db, 'regimentos', href + '#', new Set(artigos.map(a => `${href}#${a.key}`)));
  gravarEstado(db, chaveDeEstado, `${resposta.headers.get('etag') ?? ''}|${resposta.headers.get('last-modified') ?? ''}`);
  return { fetched: 1, changed: alterados };
}
export const regimentos: Coletor = {
  source: 'regimentos', label: 'Regimentos (Câmara, Senado, Congresso)',
  async run({ db, full }) {
    let buscados = 0; let alterados = 0; const paginas = new Map<string, string>();
    for (const regimento of REGIMENTOS) {
      if (!vencido(db, `regimento:${regimento.key}:check`, UMA_SEMANA_MS, full)) continue;
      if (!paginas.has(regimento.page)) { paginas.set(regimento.page, await buscarTexto(regimento.page, { minMs: 1000 })); buscados++; }
      const links = regimento.pick(linksDePdf(paginas.get(regimento.page)!, regimento.page));
      if (!links.length) throw new Error(`PDF de ${regimento.key} não encontrado na página oficial`);
      for (const [indice, link] of links.entries()) { const r = await ingerir(db, regimento, link.href, indice, full); buscados += r.fetched; alterados += r.changed; }
      gravarEstado(db, `regimento:${regimento.key}:check`, new Date().toISOString());
    }
    return { fetched: buscados, changed: alterados };
  },
};
