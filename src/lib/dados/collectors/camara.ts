import { getJson } from '../http';
import { upsertDocument, type Db } from '../db';
import { LEGISLATIVE_KEYWORDS, type Collector } from './types';

const BASE = 'https://dadosabertos.camara.leg.br/api/v2';
type Listed = { id: number; siglaTipo: string; numero: number; ano: number; ementa: string };
type Detail = { dados: Listed & { dataApresentacao: string; keywords?: string; statusProposicao?: { dataHora: string; siglaOrgao: string; descricaoSituacao: string; descricaoTramitacao: string; despacho: string } } };

export function billDocument(d: Detail['dados']) {
  const s = d.statusProposicao; const name = `${d.siglaTipo} ${d.numero}/${d.ano}`;
  const content = [`${name} — ${d.ementa}`, d.keywords ? `Palavras-chave: ${d.keywords}` : '', `Apresentação: ${d.dataApresentacao?.slice(0, 10)}`,
    s ? `Situação: ${s.descricaoSituacao}. Último andamento (${s.dataHora?.slice(0, 10)}, ${s.siglaOrgao}): ${s.descricaoTramitacao}. ${s.despacho || ''}` : ''].filter(Boolean).join('\n');
  return { name, content, movedAt: s?.dataHora ? new Date(s.dataHora + ':00-03:00').toISOString() : undefined, situacao: s?.descricaoSituacao };
}
/** Já guardadas, as proposições são revisadas da mais antiga para a mais nova, em pequenos lotes. */
function oldestIds(db: Db, limit: number) {
  return (db.prepare("SELECT url FROM documents WHERE source = 'camara' ORDER BY fetched_at ASC LIMIT ?").all(limit) as { url: string }[])
    .map(r => Number(new URL(r.url).searchParams.get('idProposicao')));
}
export const camara: Collector = {
  source: 'camara', label: 'Câmara dos Deputados',
  async run({ db, full }) {
    let fetched = 0; let changed = 0; const ids = new Set<number>();
    for (const keyword of LEGISLATIVE_KEYWORDS) {
      const pages = full ? 3 : 1;
      for (let page = 1; page <= pages; page++) {
        const list = await getJson<{ dados: Listed[] }>(`${BASE}/proposicoes?keywords=${encodeURIComponent(keyword)}&ordem=DESC&ordenarPor=id&itens=50&pagina=${page}&dataApresentacaoInicio=2019-01-01`); fetched++;
        list.dados.forEach(p => ids.add(p.id)); if (list.dados.length < 50) break;
      }
    }
    for (const id of oldestIds(db, 25)) if (id) ids.add(id);
    const known = new Set((db.prepare("SELECT url FROM documents WHERE source = 'camara'").all() as { url: string }[]).map(r => Number(new URL(r.url).searchParams.get('idProposicao'))));
    const fresh = [...ids].filter(id => !known.has(id)); const refresh = [...ids].filter(id => known.has(id));
    for (const id of [...fresh.slice(0, full ? 400 : 60), ...refresh.slice(0, 25)]) {
      const detail = await getJson<Detail>(`${BASE}/proposicoes/${id}`); fetched++;
      const bill = billDocument(detail.dados);
      if (upsertDocument(db, { source: 'camara', url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${id}`, title: bill.name, content: bill.content, publishedAt: new Date(detail.dados.dataApresentacao).toISOString(), meta: { movedAt: bill.movedAt, situacao: bill.situacao } })) changed++;
    }
    return { fetched, changed };
  },
};
