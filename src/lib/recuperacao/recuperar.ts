import { SITE } from '@/lib/base/constantes';
import { existsSync } from 'node:fs';
import type { Passagem } from '@/lib/base/tipos';
import { normalizar, termosDaConsulta } from '@/lib/base/texto';
import { espelhoDoSite } from '@/lib/recuperacao/legado/espelho';
import { executarFerramentas } from '@/lib/ferramentas/registro';
import { INTENCAO_EXTERNA, PERGUNTA_DE_ATUACAO, pedidoDeAjuda } from '@/lib/recuperacao/intencao';
import { buscarHibrido } from '@/lib/cerebro/buscar';
import { faixasDeContribuicao } from '@/lib/cerebro/faixas';
import { buscarFontesExternas } from '@/lib/recuperacao/externas';
import { trechosDeDocumentos } from '@/lib/recuperacao/documentos';
import { escolherConector, pedeRelatorio, type Conector } from '@/lib/cerebro/conectores';
import {
  cobertura,
  materialDoRelatorio,
  pesosDosTermos,
  pesquisarNaBiblioteca,
  termosDaPesquisa,
} from '@/lib/biblioteca/pesquisa';
import { caminhoDoBanco } from '@/lib/dados/db';
import { documentosPeloGrafo } from '@/lib/grafo/consulta';
import { estantesDaOrquestra, montarOrquestra } from '@/lib/agentes/orquestrador';
try {
  process.loadEnvFile('.env.knowledge');
} catch {
  /* Opcional fora da instalação local. */
}

/** O que `recuperarConhecimento` devolve: as passagens e, só quando há, o aviso de que o texto pedido não foi coletado, a marca de lista e a de relatório. */
const resultadoDe = (
  passagens: Passagem[],
  extras: { semResposta?: string; lista?: boolean; relatorio?: boolean } = {},
) => ({
  passages: passagens,
  semResposta: extras.semResposta,
  lista: extras.lista ?? false,
  relatorio: extras.relatorio ?? false,
});
/** Estantes pesquisadas quando a pergunta não cai em nenhum conector. */
const ESTANTES_PADRAO = ['artigos', 'noticias', 'cartilhas'];
/**
 * Consulta a biblioteca para uma pergunta e devolve os trechos que o modelo vai usar para escrever a resposta. Nada daqui é mostrado ao usuário como texto pronto.
 *
 * 1. Resultado de uma ferramenta do site (hoje, o cálculo do orçamento; ver src/lib/ferramentas) e, quando o conector da área reconhece um pedido de relatório
 *    ou panorama, o material do relatório (indicadores, publicações, projetos).
 * 2. Documentos e dados estruturados que a pergunta nomeia (NR, artigo, cláusula, indicador, posição do sindicato, lista de documentos): só os trechos que combinam
 *    com a pergunta e só eles, porque misturar outras fontes confunde o modelo pequeno e alonga a leitura.
 * 3. Demais perguntas: o cérebro (busca por palavras e por significado) e a pesquisa nas estantes da biblioteca indicadas pelo conector, ordenados pela cobertura
 *    dos termos da pergunta. Tudo é local (arquivos e SQLite), para a resposta não esperar por rede.
 */
export async function recuperarConhecimento(
  pergunta: string,
  conector: Conector | undefined = escolherConector(pergunta),
) {
  const ferramentas = await executarFerramentas(pergunta, { conector });
  if (ferramentas.length) return resultadoDe(ferramentas);
  if (pedeRelatorio(conector, pergunta)) {
    const relatorio = materialDoRelatorio(pergunta);
    if (relatorio.length) return resultadoDe(relatorio, { relatorio: true });
  }
  if (PERGUNTA_DE_ATUACAO.test(normalizar(pergunta))) {
    const atuacao = pesquisarNaBiblioteca(pergunta, ['noticias', 'artigos', 'cartilhas'], { limite: 3 });
    if (atuacao.length) return resultadoDe(atuacao);
  }
  const documentos = trechosDeDocumentos(pergunta, termosDaConsulta(pergunta));
  if (documentos.passages.length)
    return resultadoDe(documentos.passages as Passagem[], { lista: documentos.lista === true });
  // Contribuição por faixa (capital social ou número de colaboradores citado): só a linha da tabela que se aplica, e os vencimentos.
  const faixas = faixasDeContribuicao(pergunta);
  if (faixas.length) return resultadoDe(faixas);
  const termos = termosDaPesquisa(pergunta);
  const pesos = pesosDosTermos(termos);
  // A relevância de um trecho do cérebro conta também as "Variações:" da seção (formas de perguntar), que não vão ao modelo.
  const cerebro = (await buscarHibrido(pergunta, 3)).map(({ trecho }) => ({
    relevancia: cobertura(termos, `${trecho.titulo} ${trecho.secao} ${trecho.texto}`, pesos),
    curado: trecho.tipo === 'curado',
    passagem: {
      url: trecho.fonte ?? SITE,
      title: `${trecho.titulo} — ${trecho.secao}`,
      content: trecho.texto.replace(/^Varia[cç][oõ]es:.*$/im, '').trim(),
      fetchedAt: trecho.atualizado ?? new Date().toISOString(),
      pinned: true,
    } as Passagem,
  }));
  // Pedidos de redação e de método ("redija…", "como organizar…") se resolvem com o conhecimento escrito pela equipe; notícias antigas só desviariam a resposta.
  // Conector sem estantes (perguntas sobre a própria SINDI) também não pesquisa a biblioteca.
  // Orquestra: o especialista da área e, se a pergunta cair entre duas áreas, um de apoio (src/lib/agentes/orquestrador.ts).
  const estantes = conector
    ? conector.estantes.length
      ? estantesDaOrquestra(montarOrquestra(pergunta, conector))
      : []
    : ESTANTES_PADRAO;
  const ajuda = pedidoDeAjuda(pergunta);
  const biblioteca =
    ajuda || !estantes.length
      ? []
      : pesquisarNaBiblioteca(pergunta, estantes, {
          limite: 2,
          antigos: !cerebro.some((c) => c.curado && c.relevancia >= 0.6),
        });
  // Grafo: documentos ligados à lei, NR ou projeto que a pergunta cita pelo número; entram como candidatos e disputam pela cobertura, como os demais.
  const doGrafo =
    ajuda || !estantes.length
      ? []
      : documentosPeloGrafo(pergunta, 3).filter(
          (p) => !biblioteca.some((b) => b.url === p.url) && cobertura(termos, `${p.title} ${p.content}`, pesos) >= 0.5,
        );
  // Fontes externas coletadas (Câmara, Senado, TST, WEC, IBGE) entram quando a pergunta as menciona.
  const externas = INTENCAO_EXTERNA.test(pergunta)
    ? buscarFontesExternas(termosDaConsulta(pergunta), 2).map((p) => ({ ...p, pinned: true }))
    : [];
  let passagens: Passagem[];
  if (biblioteca.length || externas.length || doGrafo.length) {
    // Com um documento da biblioteca que cobre a pergunta, um acerto fraco do cérebro só atrapalha: ficam os trechos do cérebro que também cobrem os termos.
    // O conhecimento escrito e revisado pela equipe leva vantagem sobre notícia quando os dois cobrem a pergunta.
    // As listas de títulos de notícias e artigos (cerebro/auto) cobrem quase qualquer termo sem responder nada; o texto das publicações vem da biblioteca.
    const semListas = cerebro.filter((c) => !/ — (Notícias mais recentes|Artigos assinados)/.test(c.passagem.title));
    const fortes = semListas.filter((c) => c.relevancia >= 0.6).slice(0, 2);
    const doCerebro = fortes.length ? fortes : semListas.slice(0, 1).filter((c) => c.relevancia >= 0.3);
    passagens = [
      ...doCerebro.map((c) => ({ p: c.passagem, r: c.relevancia + (c.curado ? 0.2 : 0) })),
      ...[...biblioteca, ...doGrafo, ...externas].map((p) => ({
        p,
        r: cobertura(termos, `${p.title} ${p.content}`, pesos),
      })),
    ]
      .map((x, i) => ({ ...x, i }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .map((x) => x.p)
      .slice(0, 3);
  } else if (cerebro.length || existsSync(caminhoDoBanco())) passagens = cerebro.map((c) => c.passagem);
  // Sem a coleta local (por exemplo, numa hospedagem sem o banco), vale o espelho do site.
  else passagens = await espelhoDoSite(pergunta);
  return resultadoDe(passagens, { semResposta: documentos.semResposta });
}
