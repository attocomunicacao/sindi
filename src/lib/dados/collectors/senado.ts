import { getJson } from '../http';
import { upsertDocument } from '../db';
import { LEGISLATIVE_KEYWORDS, type Collector } from './types';

type Process = { id: number; identificacao: string; ementa: string; autoria?: string; situacaoAtual?: string; dataApresentacao?: string; dataSituacaoAtual?: string; tramitando?: string; tipoDocumento?: string };

export function processDocument(p: Process) {
  const content = [`${p.identificacao} — ${p.ementa}`, p.autoria ? `Autoria: ${p.autoria}` : '', p.tipoDocumento ? `Tipo: ${p.tipoDocumento}` : '',
    p.dataApresentacao ? `Apresentação: ${p.dataApresentacao}` : '', `Situação: ${p.situacaoAtual || 'não informada'}${p.dataSituacaoAtual ? ` (desde ${p.dataSituacaoAtual})` : ''}. Tramitando: ${p.tramitando || 'não informado'}.`].filter(Boolean).join('\n');
  return { content, movedAt: p.dataSituacaoAtual ? new Date(p.dataSituacaoAtual + 'T12:00:00Z').toISOString() : undefined };
}
export const senado: Collector = {
  source: 'senado', label: 'Senado Federal',
  async run({ db }) {
    let fetched = 0; let changed = 0;
    for (const keyword of LEGISLATIVE_KEYWORDS) {
      const list = await getJson<Process[]>(`https://legis.senado.leg.br/dadosabertos/processo?termo=${encodeURIComponent(keyword)}`); fetched++;
      for (const p of Array.isArray(list) ? list : []) {
        const doc = processDocument(p);
        if (upsertDocument(db, { source: 'senado', url: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${p.id}`, title: p.identificacao, content: doc.content,
          publishedAt: p.dataApresentacao ? new Date(p.dataApresentacao + 'T12:00:00Z').toISOString() : undefined, meta: { movedAt: doc.movedAt, situacao: p.situacaoAtual, tramitando: p.tramitando } })) changed++;
      }
    }
    return { fetched, changed };
  },
};
