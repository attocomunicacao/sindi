import { buscarJson } from '@/lib/dados/http';
import { gravarDocumento } from '@/lib/dados/db';
import { PALAVRAS_LEGISLATIVAS, type Coletor } from '@/lib/dados/coletores/tipos';

type Processo = { id: number; identificacao: string; ementa: string; autoria?: string; situacaoAtual?: string; dataApresentacao?: string; dataSituacaoAtual?: string; tramitando?: string; tipoDocumento?: string };

export function documentoDoProcesso(p: Processo) {
  const conteudo = [`${p.identificacao} — ${p.ementa}`, p.autoria ? `Autoria: ${p.autoria}` : '', p.tipoDocumento ? `Tipo: ${p.tipoDocumento}` : '',
    p.dataApresentacao ? `Apresentação: ${p.dataApresentacao}` : '', `Situação: ${p.situacaoAtual || 'não informada'}${p.dataSituacaoAtual ? ` (desde ${p.dataSituacaoAtual})` : ''}. Tramitando: ${p.tramitando || 'não informado'}.`].filter(Boolean).join('\n');
  return { content: conteudo, movedAt: p.dataSituacaoAtual ? new Date(p.dataSituacaoAtual + 'T12:00:00Z').toISOString() : undefined };
}
export const senado: Coletor = {
  source: 'senado', label: 'Senado Federal',
  async run({ db }) {
    let buscados = 0; let alterados = 0;
    for (const palavraChave of PALAVRAS_LEGISLATIVAS) {
      const lista = await buscarJson<Processo[]>(`https://legis.senado.leg.br/dadosabertos/processo?termo=${encodeURIComponent(palavraChave)}`); buscados++;
      for (const p of Array.isArray(lista) ? lista : []) {
        const documento = documentoDoProcesso(p);
        if (gravarDocumento(db, { source: 'senado', url: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${p.id}`, title: p.identificacao, content: documento.content,
          publishedAt: p.dataApresentacao ? new Date(p.dataApresentacao + 'T12:00:00Z').toISOString() : undefined, meta: { movedAt: documento.movedAt, situacao: p.situacaoAtual, tramitando: p.tramitando } })) alterados++;
      }
    }
    return { fetched: buscados, changed: alterados };
  },
};
