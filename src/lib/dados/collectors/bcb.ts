import { getJson } from '../http';
import { setIndicator } from '../db';
import type { Collector } from './types';

/**
 * Meta Selic (série 432 do SGS/Banco Central). A série é diária e repete a meta vigente também em datas futuras;
 * por isso o período mostrado é o início da vigência (última mudança até hoje) e o anterior é a meta antes dela.
 */
export function parseSgs(rows: { data: string; valor: string }[], today = new Date()) {
  const points = rows.map(r => { const [d, m, y] = r.data.split('/').map(Number); return { date: new Date(Date.UTC(y, m - 1, d)), label: r.data, value: Number(r.valor) }; })
    .filter(p => Number.isFinite(p.value) && p.date.getTime() <= today.getTime()).sort((a, b) => a.date.getTime() - b.date.getTime());
  const last = points.at(-1); if (!last) return undefined;
  let start = points.length - 1;
  while (start > 0 && points[start - 1].value === last.value) start--;
  return { period: points[start].label, value: last.value, previous: start > 0 ? points[start - 1].value : undefined };
}
export const bcb: Collector = {
  source: 'bcb', label: 'Banco Central (Selic)',
  async run({ db }) {
    const br = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    const today = new Date(); const since = new Date(today.getTime() - 540 * 86400000);
    const rows = await getJson<{ data: string; valor: string }[]>(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=${br(since)}&dataFinal=${br(today)}`);
    const point = parseSgs(rows);
    if (point) setIndicator(db, { id: 'bcb.selic-meta', source: 'bcb', group: 'Juros', label: 'Meta da taxa Selic', unit: '% ao ano', ...point, url: 'https://www.bcb.gov.br/controleinflacao/taxaselic' });
    return { fetched: 1, changed: point ? 1 : 0 };
  },
};
