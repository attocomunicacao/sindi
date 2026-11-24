import { buscarJson, listaOuErro } from '@/lib/dados/http';
import { gravarIndicador } from '@/lib/dados/db';
import type { Coletor } from '@/lib/dados/coletores/tipos';

/**
 * Meta Selic (série 432 do SGS/Banco Central). A série é diária e repete a meta vigente também em datas futuras;
 * por isso o período mostrado é o início da vigência (última mudança até hoje) e o anterior é a meta antes dela.
 */
export function lerSerieSgs(linhas: { data: string; valor: string }[], hoje = new Date()) {
  const pontos = linhas.map(r => { const [d, m, y] = r.data.split('/').map(Number); return { date: new Date(Date.UTC(y, m - 1, d)), label: r.data, value: Number(r.valor) }; })
    .filter(p => Number.isFinite(p.value) && p.date.getTime() <= hoje.getTime()).sort((a, b) => a.date.getTime() - b.date.getTime());
  const ultimo = pontos.at(-1); if (!ultimo) return undefined;
  let inicio = pontos.length - 1;
  while (inicio > 0 && pontos[inicio - 1].value === ultimo.value) inicio--;
  return { period: pontos[inicio].label, value: ultimo.value, previous: inicio > 0 ? pontos[inicio - 1].value : undefined };
}
export const bcb: Coletor = {
  source: 'bcb', label: 'Banco Central (Selic)',
  async run({ db }) {
    const formatarData = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    const hoje = new Date(); const desde = new Date(hoje.getTime() - 540 * 86400000);
    const linhas = await buscarJson<{ data: string; valor: string }[]>(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=${formatarData(desde)}&dataFinal=${formatarData(hoje)}`);
    const ponto = lerSerieSgs(listaOuErro(linhas, 'api.bcb.gov.br'));
    if (ponto) gravarIndicador(db, { id: 'bcb.selic-meta', source: 'bcb', group: 'Juros', label: 'Meta da taxa Selic', unit: '% ao ano', ...ponto, url: 'https://www.bcb.gov.br/controleinflacao/taxaselic' });
    return { fetched: 1, changed: ponto ? 1 : 0 };
  },
};
