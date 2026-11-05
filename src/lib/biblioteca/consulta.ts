import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from '../dados/db';
import { readPainel, type PainelIndicator } from '../dados/painel';
import { carregarArquivos } from '../cerebro/carregar';
import { buscarNoCerebro } from '../cerebro/buscar';
import { ESTANTES, estanteDoDocumento, estantePorId, type Estante } from './estantes';

export const POR_PAGINA = 24;
const abrir = () => { try { return existsSync(dbPath()) ? new DatabaseSync(dbPath(), { readOnly: true }) : undefined; } catch { return undefined; } };
/** Texto de leitura: sem o rodapé do site e com espaços normalizados. */
export const limpar = (texto: string) => texto.replace(/Rodapé institucional[\s\S]*$/, '').replace(/\s+/g, ' ').trim();
/** Consulta FTS5 segura: só palavras (sem operadores nem aspas vindos do usuário), por prefixo. */
export function consultaFts(q: string, operador: 'AND' | 'OR' = 'AND') {
  const termos = (q.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).slice(0, 8);
  return termos.length ? termos.map(t => `"${t}"*`).join(` ${operador} `) : undefined;
}
const dominio = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const meta = (texto: string | null): Record<string, unknown> => { try { return texto ? JSON.parse(texto) : {}; } catch { return {}; } };

type Linha = { id: number; title: string; url: string; source: string; published_at: string | null; fetched_at: string; meta: string | null; lead?: string; trecho?: string; section?: string | null; kind?: string | null };
export type Item = { id: number; titulo: string; url: string; origem: string; publicado?: string; coletado: string; resumo: string; etiquetas: string[]; estante: string };
const FONTES: Record<string, string> = { sindeprestem: 'SINDEPRESTEM', camara: 'Câmara dos Deputados', senado: 'Senado Federal', tst: 'TST', wec: 'WEC', ibge: 'IBGE', mte: 'Ministério do Trabalho', constituicao: 'Planalto', regimentos: 'Congresso Nacional', caged: 'MTE (Novo CAGED)' };
function paraItem(l: Linha): Item {
  const m = meta(l.meta); const etiquetas = [m.type, m.category, m.year && m.type ? undefined : m.year, m.situacao].filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (typeof m.year === 'number' && !etiquetas.includes(String(m.year))) etiquetas.push(String(m.year));
  return { id: l.id, titulo: l.title.replace(/\s+/g, ' ').trim(), url: l.url.split('#')[0] || l.url, origem: FONTES[l.source] ?? dominio(l.url), publicado: l.published_at ?? undefined, coletado: l.fetched_at,
    resumo: limpar(l.lead ?? '').slice(0, 240), etiquetas, estante: estanteDoDocumento({ source: l.source, section: l.section ?? (m.section as string | undefined), kind: l.kind ?? (m.kind as string | undefined), url: l.url }) };
}
const COLUNAS = `d.rowid AS id, d.title, d.url, d.source, d.published_at, d.fetched_at, d.meta, json_extract(d.meta, '$.section') AS section, json_extract(d.meta, '$.kind') AS kind`;

export type ResumoEstante = { estante: Estante; total: number; atualizado?: string };
export type ResumoDaBiblioteca = { disponivel: boolean; estantes: ResumoEstante[]; documentos: number; atualizado?: string };
export function resumoDaBiblioteca(): ResumoDaBiblioteca {
  const db = abrir();
  const arquivos = carregarArquivos().trechos;
  const estantes = ESTANTES.map((estante): ResumoEstante => {
    if (estante.especial === 'cerebro') return { estante, total: arquivos.length, atualizado: arquivos.map(t => t.atualizado).filter(Boolean).sort().at(-1) };
    if (estante.especial === 'indicadores') { const indicadores = readPainel().indicators; return { estante, total: indicadores.length, atualizado: indicadores.map(i => i.fetchedAt).sort().at(-1) }; }
    if (!db || !estante.onde) return { estante, total: 0 };
    try { const r = db.prepare(`SELECT count(*) AS n, max(d.fetched_at) AS u FROM documents d WHERE ${estante.onde}`).get() as { n: number; u: string | null }; return { estante, total: r.n, atualizado: r.u ?? undefined }; } catch { return { estante, total: 0 }; }
  });
  db?.close();
  const documentos = estantes.filter(e => !e.estante.especial).reduce((soma, e) => soma + e.total, 0);
  return { disponivel: Boolean(abrir()) || estantes.some(e => e.total > 0), estantes, documentos, atualizado: estantes.map(e => e.atualizado).filter(Boolean).sort().at(-1) };
}

export type Filtros = { q?: string; facetas: Record<string, string>; pagina: number };
export type OpcaoDeFaceta = { valor: string; n: number };
export type ListaDaEstante = { itens: Item[]; total: number; paginas: number; pagina: number; facetas: { id: string; rotulo: string; opcoes: OpcaoDeFaceta[] }[] };
export function listarEstante(estante: Estante, filtros: Filtros): ListaDaEstante {
  const vazio: ListaDaEstante = { itens: [], total: 0, paginas: 1, pagina: 1, facetas: [] };
  const db = abrir(); if (!db || !estante.onde) return vazio;
  try {
    const onde: string[] = [estante.onde]; const parametros: (string | number)[] = [];
    for (const faceta of estante.facetas) { const valor = filtros.facetas[faceta.id]; if (valor) { onde.push(`CAST((${faceta.expr}) AS TEXT) = ?`); parametros.push(valor); } }
    const fts = filtros.q ? consultaFts(filtros.q) : undefined;
    if (fts) { onde.push('d.rowid IN (SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?)'); parametros.push(fts); }
    const filtro = onde.join(' AND ');
    const total = (db.prepare(`SELECT count(*) AS n FROM documents d WHERE ${filtro}`).get(...parametros) as { n: number }).n;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA)); const pagina = Math.min(Math.max(1, filtros.pagina), paginas);
    const ordem = estante.ordem === 'data' ? "COALESCE(d.published_at, '') DESC, CAST(json_extract(d.meta, '$.year') AS INTEGER) DESC, d.title COLLATE NOCASE" : estante.ordem === 'artigo' ? 'length(d.title), d.title' : 'd.title COLLATE NOCASE';
    const linhas = db.prepare(`SELECT ${COLUNAS}, CASE WHEN instr(d.content, 'CLÁUSULA PRIMEIRA') > 0 THEN substr(d.content, instr(d.content, 'CLÁUSULA PRIMEIRA'), 700) ELSE substr(d.content, 1, 700) END AS lead FROM documents d WHERE ${filtro} ORDER BY ${ordem} LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`).all(...parametros) as Linha[];
    const facetas = estante.facetas.map(f => ({ id: f.id, rotulo: f.rotulo, opcoes: (db.prepare(`SELECT CAST((${f.expr}) AS TEXT) AS valor, count(*) AS n FROM documents d WHERE ${estante.onde} AND (${f.expr}) IS NOT NULL GROUP BY valor ORDER BY valor ${f.ordem === 'asc' ? 'ASC' : 'DESC'} LIMIT 60`).all() as OpcaoDeFaceta[]) }))
      .filter(f => f.opcoes.length > 1);
    return { itens: linhas.map(paraItem), total, paginas, pagina, facetas };
  } catch { return vazio; } finally { db.close(); }
}

export type Parte = { texto: string; destaque: boolean };
export type Achado = Item & { partes: Parte[] };
/** Divide o trecho do FTS5 (marcadores \u0001 e \u0002) em partes, para destacar as palavras encontradas sem injetar HTML. */
export function partesDoTrecho(trecho: string): Parte[] {
  return trecho.split(/([\u0001][^\u0002]*[\u0002])/).filter(Boolean).map(p => p.startsWith('\u0001') ? { texto: p.replace(/[\u0001\u0002]/g, ''), destaque: true } : { texto: p.replace(/[\u0001\u0002]/g, ''), destaque: false });
}
export type ResultadoDaBusca = { q: string; achados: Achado[]; porEstante: { id: string; n: number }[]; cerebro: { secao: string; arquivo: string; titulo: string; texto: string }[] };
export function buscarNaBiblioteca(q: string, estanteId?: string): ResultadoDaBusca {
  const vazio: ResultadoDaBusca = { q, achados: [], porEstante: [], cerebro: [] };
  const db = abrir();
  const cerebro = buscarNoCerebro(q, 6).map(r => ({ secao: r.trecho.secao, arquivo: r.trecho.arquivo, titulo: r.trecho.titulo, texto: r.trecho.texto.replace(/^Variações:.*$/m, '').trim().slice(0, 420) }));
  if (!db) return { ...vazio, cerebro };
  try {
    let achados: Achado[] = [];
    for (const operador of ['AND', 'OR'] as const) {
      const fts = consultaFts(q, operador); if (!fts) break;
      const linhas = db.prepare(`SELECT ${COLUNAS}, snippet(documents_fts, 1, char(1), char(2), ' … ', 30) AS trecho FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
        WHERE documents_fts MATCH ? AND json_extract(d.meta, '$.listing') IS NULL ORDER BY bm25(documents_fts, 6.0, 1.0) LIMIT 80`).all(fts) as Linha[];
      achados = linhas.map(l => ({ ...paraItem(l), partes: partesDoTrecho(l.trecho ?? '') }));
      if (achados.length >= 5 || operador === 'OR') break;
    }
    const contagem = new Map<string, number>(); for (const a of achados) contagem.set(a.estante, (contagem.get(a.estante) ?? 0) + 1);
    return { q, achados: (estanteId ? achados.filter(a => a.estante === estanteId) : achados).slice(0, 40), porEstante: [...contagem].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n), cerebro };
  } catch { return { ...vazio, cerebro }; } finally { db.close(); }
}

export type Documento = Item & { texto: string; tamanho: number; fonteOriginal: string };
export function lerDocumento(id: number): Documento | undefined {
  const db = abrir(); if (!db || !Number.isSafeInteger(id)) return undefined;
  try {
    const linha = db.prepare(`SELECT ${COLUNAS}, d.content AS lead FROM documents d WHERE d.rowid = ?`).get(id) as (Linha & { lead: string }) | undefined;
    if (!linha) return undefined;
    const item = paraItem({ ...linha, lead: linha.lead.slice(0, 700) });
    return { ...item, texto: linha.lead.replace(/Rodapé institucional[\s\S]*$/, '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(), tamanho: linha.lead.length, fonteOriginal: linha.url.split('#')[0] };
  } catch { return undefined; } finally { db.close(); }
}

export type Arquivo = { arquivo: string; titulo: string; tipo: 'curado' | 'autogerado'; atualizado?: string; fonte?: string; secoes: { secao: string; texto: string }[] };
/** O cérebro como livros: um arquivo é um volume e cada seção é um capítulo. O arquivo de identidade e regras (instruções internas da assistente) não é exibido. */
export function cerebroPorArquivo(): Arquivo[] {
  const mapa = new Map<string, Arquivo>();
  for (const t of carregarArquivos().trechos) {
    const volume = mapa.get(t.arquivo) ?? { arquivo: t.arquivo, titulo: t.titulo, tipo: t.tipo, atualizado: t.atualizado, fonte: t.fonte, secoes: [] };
    volume.secoes.push({ secao: t.secao, texto: t.texto.replace(/^Variações:.*$/m, '').trim() }); mapa.set(t.arquivo, volume);
  }
  return [...mapa.values()].sort((a, b) => Number(a.tipo === 'autogerado') - Number(b.tipo === 'autogerado') || a.arquivo.localeCompare(b.arquivo));
}
export const indicadores = (): PainelIndicator[] => readPainel().indicators;
export { estantePorId };
