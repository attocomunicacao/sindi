import { dataIso, buscarJson, listaOuErro } from '@/lib/dados/http';
import { gravarDocumento, type BancoDeDados } from '@/lib/dados/db';
import { PALAVRAS_LEGISLATIVAS, type Coletor } from '@/lib/dados/coletores/tipos';

const BASE_DA_API = 'https://dadosabertos.camara.leg.br/api/v2';
type Listada = { id: number; siglaTipo: string; numero: number; ano: number; ementa: string };
type Detalhe = { dados: Listada & { dataApresentacao: string; keywords?: string; statusProposicao?: { dataHora: string; siglaOrgao: string; descricaoSituacao: string; descricaoTramitacao: string; despacho: string } } };

export function documentoDoProjeto(d: Detalhe['dados']) {
  const s = d.statusProposicao; const nome = `${d.siglaTipo} ${d.numero}/${d.ano}`;
  const conteudo = [`${nome} — ${d.ementa}`, d.keywords ? `Palavras-chave: ${d.keywords}` : '', `Apresentação: ${d.dataApresentacao?.slice(0, 10)}`,
    s ? `Situação: ${s.descricaoSituacao}. Último andamento (${s.dataHora?.slice(0, 10)}, ${s.siglaOrgao}): ${s.descricaoTramitacao}. ${s.despacho || ''}` : ''].filter(Boolean).join('\n');
  return { name: nome, content: conteudo, movedAt: dataIso(s?.dataHora, { fuso: '-03:00' }), situacao: s?.descricaoSituacao };
}
/** Já guardadas, as proposições são revisadas da mais antiga para a mais nova, em pequenos lotes. */
function idsMaisAntigos(db: BancoDeDados, limite: number) {
  return (db.prepare("SELECT url FROM documents WHERE source = 'camara' ORDER BY fetched_at ASC LIMIT ?").all(limite) as { url: string }[])
    .map(r => Number(new URL(r.url).searchParams.get('idProposicao')));
}
export const camara: Coletor = {
  source: 'camara', label: 'Câmara dos Deputados',
  async run({ db, full }) {
    let buscados = 0; let alterados = 0; const ids = new Set<number>();
    for (const palavraChave of PALAVRAS_LEGISLATIVAS) {
      const paginas = full ? 3 : 1;
      for (let pagina = 1; pagina <= paginas; pagina++) {
        const lista = await buscarJson<{ dados: Listada[] }>(`${BASE_DA_API}/proposicoes?keywords=${encodeURIComponent(palavraChave)}&ordem=DESC&ordenarPor=id&itens=50&pagina=${pagina}&dataApresentacaoInicio=2019-01-01`); buscados++;
        const itens = listaOuErro<Listada>(lista.dados, 'dadosabertos.camara.leg.br/proposicoes');
        itens.forEach(p => ids.add(p.id)); if (itens.length < 50) break;
      }
    }
    for (const id of idsMaisAntigos(db, 25)) if (id) ids.add(id);
    const conhecidos = new Set((db.prepare("SELECT url FROM documents WHERE source = 'camara'").all() as { url: string }[]).map(r => Number(new URL(r.url).searchParams.get('idProposicao'))));
    const novos = [...ids].filter(id => !conhecidos.has(id)); const revisar = [...ids].filter(id => conhecidos.has(id));
    for (const id of [...novos.slice(0, full ? 400 : 60), ...revisar.slice(0, 25)]) {
      const detalhe = await buscarJson<Detalhe>(`${BASE_DA_API}/proposicoes/${id}`); buscados++;
      const projeto = documentoDoProjeto(detalhe.dados);
      if (gravarDocumento(db, { source: 'camara', url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${id}`, title: projeto.name, content: projeto.content, publishedAt: dataIso(detalhe.dados.dataApresentacao, { fuso: '-03:00' }), meta: { movedAt: projeto.movedAt, situacao: projeto.situacao } })) alterados++;
    }
    return { fetched: buscados, changed: alterados };
  },
};
