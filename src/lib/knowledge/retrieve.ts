import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalize, contextText, queryTerms, searchSnapshot, sufficientEvidence, SITE, type KnowledgeSnapshot, type Passage } from './core';
import { supabaseRequest } from './supabase';
import { orcamentoAnswer } from '../orcamento/interpretar';
import { pedidoDeAjuda } from './grounded';
import { buscarHibrido } from '../cerebro/buscar';
import { faixasDeContribuicao } from '../cerebro/faixas';
import { EXTERNAL_INTENT, searchExternal, trechosDeDocumentos } from '../dados/painel';
import { escolherConector, pedeRelatorio, type Conector } from '../cerebro/conectores';
import { cobertura, materialDoRelatorio, pesosDosTermos, pesquisarNaBiblioteca, termosDaPesquisa } from '../biblioteca/pesquisa';
import { dbPath } from '../dados/db';
import { existsSync } from 'node:fs';
try { process.loadEnvFile('.env.knowledge'); } catch { /* Optional outside the local installation. */ }

const noisePage = (url: string) => /\/noticias\/(page\/|categories\/)/.test(url);
/**
 * Pergunta sobre a atuação da entidade ("o que o Sindeprestem está fazendo sobre a NR-1?", "onde acompanho essa discussão?"): a resposta está nas notícias,
 * nos artigos e nas cartilhas do sindicato, com data, e não no texto da norma ou da lei citada.
 */
const ATUACAO = /(sindeprestem|sindicato|fenaserhtt|entidade).{0,40}(esta fazendo|tem feito|\bfez\b|\bfaz\b|atua|defende|acompanha)|(esta fazendo|atuacao|o que faz).{0,40}(sindeprestem|sindicato|fenaserhtt|entidade)|onde (posso )?acompanhar/;
/** Estantes pesquisadas quando a pergunta não cai em nenhum conector. */
const ESTANTES_PADRAO = ['artigos', 'noticias', 'cartilhas'];
/**
 * Consulta a biblioteca para uma pergunta e devolve os trechos que o modelo vai usar para escrever a resposta. Nada daqui é mostrado ao usuário como texto pronto.
 *
 * 1. Cálculo do orçamento e, quando o conector da área reconhece um pedido de relatório ou panorama, o material do relatório (indicadores, publicações, projetos).
 * 2. Documentos e dados estruturados que a pergunta nomeia (NR, artigo, cláusula, indicador, posição do sindicato, lista de documentos): só os trechos que combinam
 *    com a pergunta e só eles, porque misturar outras fontes confunde o modelo pequeno e alonga a leitura.
 * 3. Demais perguntas: o cérebro (busca por palavras e por significado) e a pesquisa nas estantes da biblioteca indicadas pelo conector, ordenados pela cobertura
 *    dos termos da pergunta. Tudo é local (arquivos e SQLite), para a resposta não esperar por rede.
 */
export async function retrieveKnowledge(question: string, language = 'pt', conector: Conector | undefined = escolherConector(question)) {
  const orcamento = calculoDoOrcamento(question, language);
  if (orcamento.length) return { context: contextText(orcamento), sufficient: true, passages: orcamento, semResposta: undefined, lista: false, relatorio: false };
  if (pedeRelatorio(conector, question)) {
    const relatorio = materialDoRelatorio(question);
    if (relatorio.length) return { context: contextText(relatorio), sufficient: true, passages: relatorio, semResposta: undefined, lista: false, relatorio: true };
  }
  if (ATUACAO.test(normalize(question))) {
    const atuacao = pesquisarNaBiblioteca(question, ['noticias', 'artigos', 'cartilhas'], { limite: 3 });
    if (atuacao.length) return { context: contextText(atuacao), sufficient: true, passages: atuacao, semResposta: undefined, lista: false, relatorio: false };
  }
  const documentos = trechosDeDocumentos(question, queryTerms(question), language);
  if (documentos.passages.length) return { context: contextText(documentos.passages), sufficient: true, passages: documentos.passages as Passage[], semResposta: undefined, lista: documentos.lista === true, relatorio: false };
  // Contribuição por faixa (capital social ou número de colaboradores citado): só a linha da tabela que se aplica, e os vencimentos.
  const faixas = faixasDeContribuicao(question);
  if (faixas.length) return { context: contextText(faixas), sufficient: true, passages: faixas, semResposta: undefined, lista: false, relatorio: false };
  const termos = termosDaPesquisa(question); const pesos = pesosDosTermos(termos);
  // A relevância de um trecho do cérebro conta também as "Variações:" da seção (formas de perguntar), que não vão ao modelo.
  const cerebro = (await buscarHibrido(question, 3)).map(({ trecho }) => ({ relevancia: cobertura(termos, `${trecho.titulo} ${trecho.secao} ${trecho.texto}`, pesos), curado: trecho.tipo === 'curado',
    passagem: { url: trecho.fonte ?? SITE, title: `${trecho.titulo} — ${trecho.secao}`, content: trecho.texto.replace(/^Varia[cç][oõ]es:.*$/im, '').trim(), fetchedAt: trecho.atualizado ?? new Date().toISOString(), pinned: true } as Passage }));
  // Pedidos de redação e de método ("redija…", "como organizar…") se resolvem com o conhecimento escrito pela equipe; notícias antigas só desviariam a resposta.
  // Conector sem estantes (perguntas sobre a própria SINDI) também não pesquisa a biblioteca.
  const estantes = conector ? conector.estantes : ESTANTES_PADRAO;
  const biblioteca = pedidoDeAjuda(question) || !estantes.length ? [] : pesquisarNaBiblioteca(question, estantes, { limite: 2, antigos: !cerebro.some(c => c.curado && c.relevancia >= 0.6) });
  // Fontes externas coletadas (Câmara, Senado, TST, WEC, IBGE) entram quando a pergunta as menciona.
  const external = EXTERNAL_INTENT.test(question) ? searchExternal(queryTerms(question), 2).map(p => ({ ...p, pinned: true })) : [];
  let passages: Passage[];
  if (biblioteca.length || external.length) {
    // Com um documento da biblioteca que cobre a pergunta, um acerto fraco do cérebro só atrapalha: ficam os trechos do cérebro que também cobrem os termos.
    // O conhecimento escrito e revisado pela equipe leva vantagem sobre notícia quando os dois cobrem a pergunta.
    // As listas de títulos de notícias e artigos (cerebro/auto) cobrem quase qualquer termo sem responder nada; o texto das publicações vem da biblioteca.
    const semListas = cerebro.filter(c => !/ — (Notícias mais recentes|Artigos assinados)/.test(c.passagem.title));
    const fortes = semListas.filter(c => c.relevancia >= 0.6).slice(0, 2);
    const doCerebro = fortes.length ? fortes : semListas.slice(0, 1).filter(c => c.relevancia >= 0.3);
    passages = [...doCerebro.map(c => ({ p: c.passagem, r: c.relevancia + (c.curado ? 0.2 : 0) })), ...[...biblioteca, ...external].map(p => ({ p, r: cobertura(termos, `${p.title} ${p.content}`, pesos) }))]
      .map((x, i) => ({ ...x, i })).sort((a, b) => b.r - a.r || a.i - b.i).map(x => x.p).slice(0, 3);
  } else if (cerebro.length || existsSync(dbPath())) passages = cerebro.map(c => c.passagem);
  // Sem a coleta local (por exemplo, numa hospedagem sem o banco), vale o espelho do site.
  else passages = await espelhoDoSite(question);
  return { context: contextText(passages), sufficient: sufficientEvidence(passages, question), passages, semResposta: documentos.semResposta, lista: false, relatorio: false };
}
/** Busca no espelho do site (Supabase ou cópia local), com prazo próprio. Só é usada quando a coleta local em SQLite não existe. */
async function espelhoDoSite(question: string): Promise<Passage[]> {
  const buscaGeral = async (): Promise<Passage[]> => {
    if (process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY)) {
      try {
        const rows = await supabaseRequest('rpc/search_sindi_knowledge', { terms: queryTerms(question), result_limit: 8, question: normalize(question) });
        if (!Array.isArray(rows)) throw new Error('Invalid knowledge response');
        return rows.map(r => ({ url: r.url, title: r.title, content: r.content, fetchedAt: r.fetched_at }));
      } catch { return localSearch(question); }
    }
    return localSearch(question);
  };
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const passages = await Promise.race([buscaGeral(), new Promise<Passage[]>(resolve => { temporizador = setTimeout(() => resolve([]), 3200); })]);
  if (temporizador) clearTimeout(temporizador);
  const asksNews = /news|latest|recent|noticia|novidade/.test(normalize(question));
  // Listing and pagination pages only add noise unless the user asks for news.
  return asksNews ? passages : passages.filter(p => !noisePage(p.url));
}
async function localSearch(question: string): Promise<Passage[]> {
  try {
    const snapshot: KnowledgeSnapshot = JSON.parse(await readFile(path.join(process.cwd(), '.data/knowledge/current.json'), 'utf8'));
    return searchSnapshot(snapshot, question, 8);
  } catch { return []; }
}
/**
 * Cálculo do orçamento de terceirização (uma conta sobre a tabela de referência) como trecho para o modelo: ele apresenta o resultado com palavras próprias,
 * e a verificação de fatos confere que cada valor citado está no cálculo. A referência leva à ferramenta, com os postos já preenchidos.
 */
export function calculoDoOrcamento(question: string, language: string): Passage[] {
  const texto = orcamentoAnswer(question, language); if (!texto) return [];
  const ferramenta = texto.match(/\]\((\/orcamento[^)]*)\)/)?.[1] ?? '/orcamento';
  return [{ url: ferramenta, title: 'Ferramenta de orçamento de terceirização', content: texto.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'), fetchedAt: new Date().toISOString(), pinned: true }];
}

/** Formata a página de contato coletada (usado só para gerar o arquivo de contatos do cérebro, não nas respostas do chat). */
export function contactFromSource(content: string, language: string) {
  const body = content.split('Rodapé institucional')[0];
  const lines = body.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^(ligar|e-?mail|ligare-mail|whatsappe-mail|whatsapp)$/i.test(l));
  const start = lines.findIndex(l => /^setor |^comunica/i.test(l));
  const blocks = start >= 0 ? lines.slice(start) : [];
  const hours = content.match(/Segunda a Sexta das\s*\d{1,2}:\d{2}\s*[ÀàAa]s\s*\d{1,2}:\d{2}/)?.[0]?.replace(/\s+/g, ' ');
  if (!blocks.length && !hours) return undefined;
  const list = blocks.map(l => /^(setor |comunica)/i.test(l) ? `\n**${l}**` : `- ${l}`).join('\n').trim();
  const schedule = hours ? `\n\n${language === 'en' ? 'Hours' : 'Horário'}: ${hours}.` : '';
  return `${language === 'en' ? 'Contact details on the official page' : 'Contatos da página oficial'}:\n\n${list}${schedule}`;
}
