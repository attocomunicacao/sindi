import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath, falhasSeguidas } from '@/lib/dados/db';

export type PainelIndicator = { id: string; group: string; label: string; value: number; unit: string; period: string; previous: number | null; source: string; url: string; fetchedAt: string };
export type PainelBill = { source: string; title: string; summary: string; situacao: string | null; movedAt: string | null; url: string };
export type PainelNews = { source: string; title: string; publishedAt: string | null; url: string };
export type Painel = { available: boolean; updatedAt: string | null; indicators: PainelIndicator[]; bills: PainelBill[]; news: PainelNews[]; sindicato: { noticias: PainelNews[]; artigos: PainelNews[] }; sources: { source: string; lastOk: string | null; status: string; /** Execuções seguidas em erro, da mais recente para trás. */ failures?: number }[]; series: Record<string, { period: string; value: number }[]> };

/** Ordem de exibição dos indicadores; os demais, se existirem, vêm depois. */
export const INDICATOR_ORDER = ['bcb.selic-meta', 'ibge.ipca-12m', 'ibge.ipca-mensal', 'ibge.desocupacao', 'caged.saldo', 'caged.saldo-sp', 'caged.saldo-temporario', 'caged.saldo-servicos', 'ibge.servicos'];
/** Projetos que importam à terceirização e ao trabalho temporário. */
export const BILL_TOPIC = /terceiriz|trabalho tempor[aá]ri|6\.?019|escala 6\s?x\s?1|jornada de trabalho|contribui[cç][aã]o sindical|reforma trabalhista|13\.?467|13\.?429/i;
/** Notícias do IBGE só entram se tratarem de trabalho ou economia. */
export const IBGE_NEWS_TOPIC = /emprego|trabalh|desocup|ocupa[cç]|servi[cç]os|infla[cç]|ipca|pib|renda|sal[aá]rio|ind[uú]stria|economia|com[eé]rcio/i;
const NEWS_SOURCES = ['tst', 'wec', 'ibge', 'mte'];

const headline = (content: string) => content.split(String.fromCharCode(10))[0].trim();
export function painelVazio(): Painel { return { available: false, updatedAt: null, indicators: [], bills: [], news: [], sindicato: { noticias: [], artigos: [] }, sources: [], series: {} }; }

export function lerPainel(file = dbPath()): Painel {
  if (!existsSync(file)) return painelVazio();
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const indicators = (db.prepare('SELECT id, grp, label, value, unit, period, previous, source, url, fetched_at FROM indicators').all() as Record<string, string | number | null>[])
      .map(r => ({ id: String(r.id), group: String(r.grp), label: String(r.label), value: Number(r.value), unit: String(r.unit), period: String(r.period), previous: r.previous === null ? null : Number(r.previous), source: String(r.source), url: String(r.url), fetchedAt: String(r.fetched_at) }))
      .sort((a, b) => (INDICATOR_ORDER.indexOf(a.id) + 1 || 99) - (INDICATOR_ORDER.indexOf(b.id) + 1 || 99));
    const rows = db.prepare(`SELECT source, title, content, url, json_extract(meta, '$.situacao') AS situacao, json_extract(meta, '$.movedAt') AS movedAt
      FROM documents WHERE source IN ('camara','senado') ORDER BY COALESCE(json_extract(meta, '$.movedAt'), published_at) DESC LIMIT 400`).all() as { source: string; title: string; content: string; url: string; situacao: string | null; movedAt: string | null }[];
    const bills = rows.filter(r => BILL_TOPIC.test(headline(r.content))).slice(0, 8).map(r => ({
      source: r.source, title: r.title, summary: headline(r.content).replace(/^[^—]*—\s*/, '').slice(0, 220), situacao: r.situacao, movedAt: r.movedAt, url: r.url }));
    const allNews = db.prepare(`SELECT source, title, published_at AS publishedAt, url FROM documents WHERE source IN (${NEWS_SOURCES.map(() => '?').join(',')})
      AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 80`).all(...NEWS_SOURCES) as PainelNews[];
    const news = allNews.filter(n => n.source !== 'ibge' || IBGE_NEWS_TOPIC.test(n.title)).slice(0, 12);
    const posts = (section: string, limit: number) => db.prepare(`SELECT source, title, published_at AS publishedAt, url FROM documents WHERE source = 'sindeprestem' AND json_extract(meta, '$.section') = ? AND url LIKE '%/post/%'
      AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT ?`).all(section, limit) as PainelNews[];
    const sindicato = { noticias: posts('noticia', 8), artigos: posts('artigo', 4) };
    const sources = db.prepare(`SELECT source, MAX(CASE WHEN status = 'ok' THEN finished_at END) AS lastOk,
      (SELECT status FROM runs r2 WHERE r2.source = runs.source ORDER BY id DESC LIMIT 1) AS status FROM runs GROUP BY source`).all() as Painel['sources'];
    for (const s of sources) s.failures = falhasSeguidas(db, s.source);
    const updatedAt = sources.map(s => s.lastOk).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;
    // Série mensal já guardada pela coleta (hoje, o saldo do Novo CAGED): alimenta os gráficos de evolução do painel.
    const series: Painel['series'] = {};
    for (const r of db.prepare('SELECT id, period, value FROM series ORDER BY id, period').all() as { id: string; period: string; value: number }[]) (series[r.id] ??= []).push({ period: r.period, value: r.value });
    return { available: true, updatedAt, indicators, bills, news, sindicato, sources, series };
  } finally { db.close(); }
}

/** Leitura do painel guardada por 30 s: as rotas e páginas públicas a chamam a cada pedido, e a coleta roda a cada 30 minutos. `lerPainel` continua lendo direto do banco. */
const TTL_DO_PAINEL_MS = 30_000;
const painelEmCache = new Map<string, { em: number; valor: Painel }>();
export function lerPainelEmCache(file = dbPath(), agora = Date.now()): Painel {
  const guardado = painelEmCache.get(file); if (guardado && agora - guardado.em < TTL_DO_PAINEL_MS) return guardado.valor;
  const valor = lerPainel(file); painelEmCache.set(file, { em: agora, valor }); return valor;
}
export const esquecerPainelEmCache = () => painelEmCache.clear();
