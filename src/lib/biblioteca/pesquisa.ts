import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from '../dados/db';
import { fraseDoIndicador, nrNumber, readPainel, trechosRelevantes } from '../dados/painel';
import { normalize, type Passage } from '../knowledge/core';
import { ESTANTES } from './estantes';

/**
 * Pesquisa da SINDI na biblioteca (a mesma base de `/base`): é por aqui que o chat consome as notícias, os artigos do presidente, as cartilhas, os projetos de lei
 * e as notícias do setor. O conector da pergunta diz em quais estantes procurar; o índice de texto integral (FTS5/BM25) traz os candidatos e só passam os
 * documentos que cobrem a maior parte dos termos da pergunta, com preferência pelos mais recentes. Assunto ausente da biblioteca devolve vazio, e não um acerto fraco.
 */
const VAZIAS = new Set(('a o as os e de da do das dos em no na nos nas um uma uns umas para por com sem que qual quais como onde quando quem porque sobre entre ate apos pelo pela pelos pelas ao aos este esta esse essa isso isto ' +
  'ser sao foi tem ter esta estao pode podem posso devo deve devem preciso precisa precisam quero queria gostaria saber fazer faz fazendo feito ha mais menos muito ja ainda tambem seu sua seus suas meu minha meus minhas nosso nossa ' +
  'voce sindi sindeprestem sindicato entidade empresa empresas empresario empresarios principais principal atual atuais hoje agora neste nesta nesse nessa mes semana ano brasil pais quantos quantas quanto foram sera serao tera estar ' +
  'afeta afetar afetam impacta impactar impactam impacto impactos mudou mudanca mudancas cuidados adotar considerar acompanhar acompanhados relacao explicar explique significa quer dizer informacoes informacao ' +
  'the and what how is are of to in on for').split(' '));
/** Termos que distinguem o assunto da pergunta, na ordem em que aparecem (no máximo 8). */
export function termosDaPesquisa(pergunta: string): string[] {
  return [...new Set((normalize(pergunta).match(/[a-z0-9]{3,}/g) ?? []).filter(t => !VAZIAS.has(t) && !/^\d{1,3}$/.test(t)))].slice(0, 8);
}
/** Radical para casar singular, plural e gênero ("tributária", "tributário", "tributárias") tanto no índice quanto na conferência de cobertura. */
export const radical = (termo: string) => termo.length >= 8 ? termo.slice(0, termo.length - 2) : termo.length >= 5 ? termo.replace(/(es|s)$/, '') : termo;

/**
 * Fração dos termos da pergunta presentes no texto (por radical). É a medida comum de relevância entre o cérebro e a biblioteca. Com `pesos`, cada termo conta
 * conforme a sua raridade na biblioteca: "gestante" ou "tributária" dizem do que trata a pergunta; "equipe" ou "escrever" aparecem em qualquer texto.
 */
export function cobertura(termos: string[], texto: string, pesos?: number[]): number {
  if (!termos.length) return 0;
  const alvo = normalize(texto); let achado = 0; let total = 0;
  termos.forEach((t, i) => { const peso = pesos?.[i] ?? 1; total += peso; if (alvo.includes(radical(t))) achado += peso; });
  return total ? achado / total : 0;
}

/**
 * Cobertura no melhor pedaço do texto (janelas de cerca de 700 caracteres), junto com o título. Num documento longo, como uma cartilha, quase qualquer palavra
 * aparece em algum lugar; o que mostra que o documento trata da pergunta é os termos aparecerem perto uns dos outros.
 */
export function coberturaLocal(termos: string[], titulo: string, texto: string, pesos?: number[], janela = 700): number {
  if (texto.length <= janela * 1.5) return cobertura(termos, `${titulo}\n${texto}`, pesos);
  let melhor = 0;
  for (let inicio = 0; inicio < texto.length && melhor < 1; inicio += janela / 2) melhor = Math.max(melhor, cobertura(termos, `${titulo}\n${texto.slice(inicio, inicio + janela)}`, pesos));
  return melhor;
}

const frequencias = new Map<string, { peso: number; ate: number }>();
/**
 * Peso de cada termo pela raridade na biblioteca inteira (quanto menos documentos o contêm, mais ele pesa). Termo que não existe na biblioteca pesa muito e nunca
 * é encontrado: assunto ausente não vira acerto por causa das palavras comuns da pergunta. As contagens ficam em memória por uma hora.
 */
export function pesosDosTermos(termos: string[], arquivo = dbPath()): number[] {
  const agora = Date.now(); const faltam = termos.filter(t => (frequencias.get(`${arquivo}|${radical(t)}`)?.ate ?? 0) < agora);
  if (faltam.length && existsSync(arquivo)) {
    try {
      const db = new DatabaseSync(arquivo, { readOnly: true });
      try {
        const total = (db.prepare('SELECT count(*) AS n FROM documents').get() as { n: number }).n || 1;
        const contar = db.prepare('SELECT count(*) AS n FROM documents_fts WHERE documents_fts MATCH ?');
        for (const t of faltam) frequencias.set(`${arquivo}|${radical(t)}`, { peso: Math.max(0.3, Math.log(total / ((contar.get(`"${radical(t)}"*`) as { n: number }).n + 1))), ate: agora + 3600e3 });
      } finally { db.close(); }
    } catch { /* sem o banco, todos os termos pesam o mesmo */ }
  }
  return termos.map(t => frequencias.get(`${arquivo}|${radical(t)}`)?.peso ?? 1);
}
/** Peso a partir do qual um termo distingue o assunto (aparece em menos de um terço dos documentos). */
const PESO_DISTINTIVO = 1.2;

const ROTULO: Record<string, string> = { noticias: 'Notícia publicada pelo SINDEPRESTEM', artigos: 'Artigo do presidente do SINDEPRESTEM', cartilhas: 'Cartilha do SINDEPRESTEM', juridico: 'Documento jurídico publicado pelo SINDEPRESTEM',
  proposicoes: 'Projeto em tramitação no Congresso', 'noticias-setor': 'Notícia do setor', orientacoes: 'Orientação do Ministério do Trabalho e Emprego', institucional: 'Página institucional do SINDEPRESTEM' };
const dataBr = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : undefined;
const limpar = (texto: string) => texto.replace(/Rodapé institucional[\s\S]*$/, '').replace(/^Por Vander Morales[^\n]*$/gm, '').replace(/[ \t]+/g, ' ').trim();
type Linha = { title: string; url: string; content: string; published_at: string | null; fetched_at: string; rank: number };

/** `antigos: false` dispensa textos com mais de três anos (quando o conhecimento escrito pela equipe já responde, notícia antiga só acrescenta ruído). */
export type OpcoesDaPesquisa = { limite?: number; minimo?: number; arquivo?: string; agora?: Date; antigos?: boolean };
export function pesquisarNaBiblioteca(pergunta: string, estantes: string[], { limite = 2, minimo = 0.6, arquivo = dbPath(), agora = new Date(), antigos = true }: OpcoesDaPesquisa = {}): Passage[] {
  const termos = termosDaPesquisa(pergunta);
  // "NR-1" não sobrevive como termo (duas letras e um número): vira uma expressão obrigatória no índice e no texto.
  const nr = nrNumber(pergunta); const citaNr = nr === undefined ? undefined : new RegExp(`\\bnr[- ]?0?${nr}\\b`);
  const alvos = ESTANTES.filter(e => estantes.includes(e.id) && e.onde);
  if ((!termos.length && nr === undefined) || !alvos.length || !existsSync(arquivo)) return [];
  let db: DatabaseSync;
  try { db = new DatabaseSync(arquivo, { readOnly: true }); } catch { return []; }
  try {
    const porTermos = termos.map(t => `"${radical(t)}"*`).join(' OR '); const porNr = nr === undefined ? '' : `("nr ${nr}" OR "nr 0${nr}")`;
    const consulta = porNr && porTermos ? `${porNr} AND (${porTermos})` : porNr || porTermos;
    const pesos = pesosDosTermos(termos, arquivo);
    // Um documento trata do assunto quando um termo distintivo da pergunta está no título. Palavras da pergunta espalhadas pelo corpo de uma notícia sobre
    // outro tema são o acerto fraco que faz um modelo pequeno responder errado. Pergunta só com palavras comuns não tem o que procurar aqui.
    // Numa biblioteca pequena todos os pesos são baixos; o limite acompanha o termo mais raro da pergunta.
    const distintivo = Math.min(PESO_DISTINTIVO, Math.max(...pesos, 0) * 0.6);
    const ancoras = termos.filter((_, i) => pesos[i] >= distintivo).map(radical);
    if (termos.length && !ancoras.length && nr === undefined) return [];
    const candidatos: (Linha & { estante: string; pontos: number })[] = [];
    for (const estante of alvos) {
      // Notícias e artigos: só as publicações (com data), nunca as páginas de listagem.
      const publicacao = estante.id === 'noticias' || estante.id === 'artigos' ? "AND d.url LIKE '%/post/%' AND d.published_at IS NOT NULL" : '';
      // A busca no índice é resolvida primeiro e sozinha (MATERIALIZED): com o filtro da estante na mesma consulta, o SQLite chega a percorrer os documentos
      // e repetir a busca para cada um (medido: 18 s contra 0,05 s).
      const linhas = db.prepare(`WITH achados AS MATERIALIZED (SELECT rowid AS id, bm25(documents_fts, 6.0, 1.0) AS rank FROM documents_fts WHERE documents_fts MATCH ?)
        SELECT d.title, d.url, d.content, d.published_at, d.fetched_at, a.rank FROM achados a JOIN documents d ON d.rowid = a.id WHERE ${estante.onde} ${publicacao} ORDER BY a.rank LIMIT 30`).all(consulta) as Linha[];
      linhas.forEach((l, posicao) => {
        const noTitulo = cobertura(termos, l.title, pesos); const geral = coberturaLocal(termos, l.title, l.content, pesos);
        if (citaNr && !citaNr.test(normalize(`${l.title} ${l.content}`))) return;
        const titulo = normalize(l.title);
        if (ancoras.length && !ancoras.some(a => titulo.includes(a)) && !(citaNr && citaNr.test(titulo))) return;
        // Com um ou dois termos, todos precisam aparecer; com mais, a maior parte do peso.
        if (termos.length && geral < (termos.length <= 2 ? 0.999 : minimo)) return;
        const idade = l.published_at ? (agora.getTime() - Date.parse(l.published_at)) / (365 * 864e5) : 1.5;
        // Texto recente pesa mais: em três anos uma notícia deixa de descrever "o cenário atual".
        candidatos.push({ ...l, estante: estante.id, pontos: geral * 10 + noTitulo * 6 + Math.max(-2, 2.5 - idade * 1.5) + (estante.id === 'artigos' ? 0.5 : 0) - posicao * 0.05 });
      });
    }
    const vistos = new Set<string>(); const escolhidos: Passage[] = [];
    // Havendo texto dos últimos três anos sobre o assunto, os mais antigos ficam de fora: notícia velha não descreve a situação atual.
    const recente = (c: Linha) => !c.published_at || agora.getTime() - Date.parse(c.published_at) <= 3 * 365 * 864e5;
    const ordenados = candidatos.sort((a, b) => b.pontos - a.pontos);
    for (const c of ordenados.some(recente) || !antigos ? ordenados.filter(recente) : ordenados.slice(0, 1)) {
      const titulo = c.title.replace(/^Artigo\s*[-–:]\s*/i, '').replace(/\s+/g, ' ').trim();
      if (vistos.has(normalize(titulo))) continue; vistos.add(normalize(titulo));
      const data = dataBr(c.published_at);
      escolhidos.push({ url: c.url.split('#')[0], title: titulo, fetchedAt: c.fetched_at, pinned: true,
        content: `${ROTULO[c.estante] ?? 'Documento da biblioteca'}${data ? ` em ${data}` : ''}. ${trechosRelevantes(limpar(c.content), [...termos.map(radical), ...(nr === undefined ? [] : [`nr-${nr}`, `nr ${nr}`])], 650, 320).replace(/\s+/g, ' ')}` });
      if (escolhidos.length === limite) break;
    }
    return escolhidos;
  } catch { return []; } finally { db.close(); }
}

const numero = (valor: number, unidade: string) => valor.toLocaleString('pt-BR', /%/.test(unidade) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
const mesBr = (periodo: string) => { const m = periodo.match(/^(\d{4})-?(\d{2})/); return m ? `${m[2]}/${m[1]}` : periodo; };
/**
 * Material de um relatório setorial (SINDI Relatórios): os indicadores oficiais mais recentes, as últimas publicações do SINDEPRESTEM e os projetos em tramitação
 * com movimentação recente, cada bloco com a data de referência. O modelo redige o resumo; os números vêm todos daqui, com a fonte.
 */
export function materialDoRelatorio(pergunta: string, arquivo = dbPath()): Passage[] {
  const painel = readPainel(arquivo); if (!painel.available) return [];
  const q = normalize(pergunta); const agora = new Date().toISOString(); const blocos: Passage[] = [];
  // Pergunta sobre leis e projetos: os projetos vêm primeiro e em maior número, e os indicadores econômicos ficam de fora.
  const legislativo = /projeto|tramita|congresso|legislac|regulatori|\bleis?\b/.test(q) && !/indicador|emprego|mercado|economi/.test(q);
  if (painel.indicators.length && !legislativo) blocos.push({ url: '/painel', title: 'Indicadores oficiais mais recentes', fetchedAt: painel.updatedAt ?? agora, pinned: true,
    // Sem a variação mensal do IPCA, o saldo de São Paulo e o volume de serviços (ficam no painel): menos linhas para ler e para escrever.
    content: painel.indicators.filter(i => !['ibge.ipca-mensal', 'caged.saldo-sp', 'ibge.servicos'].includes(i.id) || new RegExp(i.id === 'caged.saldo-sp' ? 'sao paulo|paulista' : i.id === 'ibge.servicos' ? 'volume de servicos|pms' : 'ipca mensal|no mes').test(q)).slice(0, 7).map(i => `- ${fraseDoIndicador(i)}`).join('\n') });
  // Evolução mês a mês só quando pedida: é o único indicador com série guardada pela coleta.
  if (/12 meses|mes a mes|evolucao|compar|historico|ultimos meses/.test(q)) {
    const id = /servico/.test(q) ? 'caged.saldo-servicos' : /temporari/.test(q) ? 'caged.saldo-temporario' : /sao paulo|\bsp\b|estado/.test(q) ? 'caged.saldo-sp' : 'caged.saldo';
    const serie = (painel.series[id] ?? []).slice(-12); const rotulo = painel.indicators.find(i => i.id === id)?.label ?? 'Saldo do Novo CAGED';
    if (serie.length > 1) blocos.push({ url: '/painel', title: `${rotulo}, mês a mês`, fetchedAt: painel.updatedAt ?? agora, pinned: true, content: serie.map(s => `${mesBr(s.period)}: ${s.value < 0 ? 'fechou' : 'abriu'} ${numero(Math.abs(s.value), 'vagas')} vagas`).join('; ') + `. A coleta guarda ${serie.length} meses desta série; não há dados de meses anteriores.` });
  }
  if (painel.sindicato.noticias.length) blocos.push({ url: 'https://www.sindeprestem.com.br/noticias', title: 'Publicações recentes do SINDEPRESTEM', fetchedAt: agora, pinned: true,
    content: [...painel.sindicato.artigos.slice(0, 1), ...painel.sindicato.noticias.slice(0, 4)].map(n => `- ${dataBr(n.publishedAt) ?? 's/d'}: ${n.title.replace(/\s+/g, ' ').slice(0, 130)}`).join('\n') });
  if (painel.bills.length) blocos.push({ url: '/painel', title: 'Projetos em tramitação no Congresso (em discussão, não são lei)', fetchedAt: agora, pinned: true,
    content: painel.bills.slice(0, legislativo ? 5 : 3).map(b => `- ${b.title}: ${b.summary.slice(0, 110)}${b.situacao ? ` Situação: ${b.situacao}.` : ''}${b.movedAt ? ` Última movimentação: ${dataBr(b.movedAt)}.` : ''}`).join('\n') });
  return legislativo ? blocos.reverse() : blocos;
}
