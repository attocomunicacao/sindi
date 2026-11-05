import { getJson } from '../http';
import { setIndicator, upsertDocument } from '../db';
import type { Collector } from './types';

type Sidra = { resultados: { series: { serie: Record<string, string> }[] }[] }[];
const BASE = 'https://servicodados.ibge.gov.br/api/v3';

/** Indicadores do IBGE (SIDRA): tabela, variável, classificação opcional. */
export const INDICATORS = [
  { id: 'ibge.desocupacao', group: 'Emprego', label: 'Taxa de desocupação (PNAD Contínua)', unit: '% da força de trabalho', table: 6381, variable: 4099, url: 'https://sidra.ibge.gov.br/tabela/6381' },
  { id: 'ibge.ipca-mensal', group: 'Preços', label: 'IPCA — variação mensal', unit: '% no mês', table: 7060, variable: 63, classification: '315[7169]', url: 'https://sidra.ibge.gov.br/tabela/7060' },
  { id: 'ibge.ipca-12m', group: 'Preços', label: 'IPCA — acumulado em 12 meses', unit: '% em 12 meses', table: 7060, variable: 2265, classification: '315[7169]', url: 'https://sidra.ibge.gov.br/tabela/7060' },
  { id: 'ibge.servicos', group: 'Serviços', label: 'Volume de serviços (PMS) — variação mensal', unit: '% vs. mês anterior', table: 5906, variable: 11623, classification: '11046[56726]', url: 'https://sidra.ibge.gov.br/tabela/5906' },
] as const;

/** Converte o código de período do SIDRA (202609 ou 20263) em texto legível. */
export function periodLabel(code: string) {
  if (/^\d{6}$/.test(code)) return `${code.slice(4)}/${code.slice(0, 4)}`;
  return code;
}
export function lastTwo(data: Sidra): { period: string; value: number; previous?: number } | undefined {
  const series = data[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!series) return undefined;
  const entries = Object.entries(series).filter(([, v]) => v !== '...' && v !== '-' && Number.isFinite(Number(v))).sort(([a], [b]) => a.localeCompare(b));
  const last = entries.at(-1); if (!last) return undefined;
  return { period: last[0], value: Number(last[1]), previous: entries.length > 1 ? Number(entries.at(-2)![1]) : undefined };
}
type News = { id: number; titulo: string; introducao: string; data_publicacao: string; link: string; editorias?: string };

export const ibge: Collector = {
  source: 'ibge', label: 'IBGE',
  async run({ db, full }) {
    let fetched = 0; let changed = 0;
    for (const item of INDICATORS) {
      const cls = 'classification' in item ? `&classificacao=${encodeURIComponent(item.classification)}` : '';
      const data = await getJson<Sidra>(`${BASE}/agregados/${item.table}/periodos/-3/variaveis/${item.variable}?localidades=N1%5Ball%5D${cls}`);
      const point = lastTwo(data); fetched++;
      if (point) { setIndicator(db, { id: item.id, source: 'ibge', group: item.group, label: item.label, value: point.value, unit: item.unit, period: periodLabel(point.period), previous: point.previous, url: item.url }); changed++; }
    }
    const pages = full ? 40 : 1;
    for (let page = 1; page <= pages; page++) {
      const news = await getJson<{ items: News[]; totalPages: number }>(`${BASE}/noticias/?qtd=50&page=${page}`); fetched++;
      for (const n of news.items) {
        const [d, m, y] = (n.data_publicacao || '').slice(0, 10).split('/');
        const publishedAt = y ? new Date(`${y}-${m}-${d}T12:00:00Z`).toISOString() : undefined;
        if (upsertDocument(db, { source: 'ibge', url: n.link, title: n.titulo, content: n.introducao || n.titulo, publishedAt, meta: { editorias: n.editorias } })) changed++;
      }
      if (page >= news.totalPages) break;
    }
    return { fetched, changed };
  },
};
