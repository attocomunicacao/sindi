/**
 * Catálogo da biblioteca da SINDI: cada estante agrupa um tipo de documento da base de conhecimento. É a mesma base que o cérebro consulta ao responder;
 * a página /base só a torna navegável. As condições `onde` são SQL sobre a tabela `documents` (coleta em .data/dados), nunca montadas a partir de entrada do usuário.
 */
export type Ala = 'sindicato' | 'legislacao' | 'setor' | 'sindi';
export type Faceta = { id: string; rotulo: string; expr: string; ordem?: 'desc' | 'asc' };
export type Estante = {
  id: string; nome: string; descricao: string; ala: Ala; icone: 'landmark' | 'scale' | 'book-open' | 'gavel' | 'newspaper' | 'pen-line' | 'hard-hat' | 'scroll-text' | 'building-2' | 'file-stack' | 'globe' | 'compass' | 'line-chart' | 'brain';
  /** Condição SQL sobre `documents d`. Estantes especiais (indicadores, cérebro) não vêm da tabela de documentos. */
  onde?: string; facetas: Faceta[]; ordem: 'data' | 'titulo' | 'artigo'; especial?: 'indicadores' | 'cerebro';
};
const SECAO = (s: string) => `d.source = 'sindeprestem' AND json_extract(d.meta, '$.section') = '${s}' AND json_extract(d.meta, '$.listing') IS NULL`;
const ANO_DA_PUBLICACAO: Faceta = { id: 'ano', rotulo: 'Ano', expr: "strftime('%Y', d.published_at)" };

export const ALAS: Record<Ala, { nome: string; descricao: string }> = {
  sindicato: { nome: 'O sindicato', descricao: 'O que o SINDEPRESTEM publica: quem é, o que cobra, o que firmou e o que escreveu.' },
  legislacao: { nome: 'Leis, normas e Congresso', descricao: 'O texto oficial que fundamenta as respostas jurídicas e de segurança do trabalho.' },
  setor: { nome: 'O setor', descricao: 'Notícias e números públicos sobre emprego, serviços e relações de trabalho.' },
  sindi: { nome: 'A SINDI', descricao: 'O conhecimento escrito pela equipe para orientar as respostas da assistente.' },
};

export const ESTANTES: Estante[] = [
  { id: 'institucional', nome: 'Institucional e contribuições', ala: 'sindicato', icone: 'landmark', ordem: 'titulo', facetas: [],
    descricao: 'Quem é o sindicato, missão, contatos, associação e a tabela de contribuições.', onde: `d.source = 'sindeprestem' AND json_extract(d.meta, '$.section') IN ('institucional', 'contribuicao', 'contato', 'outro') AND json_extract(d.meta, '$.listing') IS NULL` },
  { id: 'convencoes', nome: 'Convenções coletivas', ala: 'sindicato', icone: 'scale', ordem: 'data',
    descricao: 'Convenções, aditivos, erratas e comunicados por categoria e ano, com o texto integral extraído dos PDFs.', onde: SECAO('convencao'),
    facetas: [{ id: 'categoria', rotulo: 'Categoria', expr: "json_extract(d.meta, '$.category')", ordem: 'asc' }, { id: 'tipo', rotulo: 'Tipo', expr: "json_extract(d.meta, '$.type')", ordem: 'asc' }, { id: 'ano', rotulo: 'Ano', expr: "json_extract(d.meta, '$.year')" }] },
  { id: 'cartilhas', nome: 'Cartilhas', ala: 'sindicato', icone: 'book-open', ordem: 'titulo', facetas: [],
    descricao: 'Material de orientação para empresas: trabalho temporário, Lei 13.429/17, bombeiro civil e ESG.', onde: SECAO('cartilha') },
  { id: 'juridico', nome: 'Documentos jurídicos', ala: 'sindicato', icone: 'gavel', ordem: 'data',
    descricao: 'Leis, decretos, medidas provisórias e processos publicados na página Jurídico.', onde: SECAO('juridico'), facetas: [{ id: 'ano', rotulo: 'Ano', expr: "json_extract(d.meta, '$.year')" }] },
  { id: 'noticias', nome: 'Notícias do SINDEPRESTEM', ala: 'sindicato', icone: 'newspaper', ordem: 'data',
    descricao: 'Publicações do sindicato desde 2020: eventos, cursos, posicionamentos e atuação institucional.', onde: SECAO('noticia'), facetas: [ANO_DA_PUBLICACAO] },
  { id: 'artigos', nome: 'Artigos do presidente', ala: 'sindicato', icone: 'pen-line', ordem: 'data',
    descricao: 'Análises assinadas sobre jornada, reforma, custo Brasil, CLT e o futuro do setor.', onde: SECAO('artigo'), facetas: [ANO_DA_PUBLICACAO] },

  { id: 'normas', nome: 'Normas Regulamentadoras', ala: 'legislacao', icone: 'hard-hat', ordem: 'artigo',
    descricao: 'NR-1 a NR-38, segurança e saúde no trabalho, do portal do Ministério do Trabalho e Emprego.', onde: "d.source = 'mte' AND d.url LIKE '%normas-regulamentadoras-vigentes/%'", facetas: [] },
  { id: 'constituicao', nome: 'Constituição Federal', ala: 'legislacao', icone: 'scroll-text', ordem: 'artigo',
    descricao: 'O texto compilado, um documento por artigo, incluindo o ADCT.', onde: "d.source = 'constituicao'", facetas: [] },
  { id: 'regimentos', nome: 'Regimentos do Congresso', ala: 'legislacao', icone: 'building-2', ordem: 'artigo',
    descricao: 'Regimento Interno da Câmara, do Senado e Regimento Comum, um documento por artigo.', onde: "d.source = 'regimentos'",
    facetas: [{ id: 'regimento', rotulo: 'Regimento', expr: "CASE json_extract(d.meta, '$.regiment') WHEN 'ricd' THEN 'Câmara dos Deputados' WHEN 'risf' THEN 'Senado Federal' WHEN 'rccn' THEN 'Congresso Nacional' END", ordem: 'asc' }] },
  { id: 'proposicoes', nome: 'Projetos em tramitação', ala: 'legislacao', icone: 'file-stack', ordem: 'data',
    descricao: 'Proposições da Câmara e do Senado sobre terceirização, trabalho temporário, jornada e reforma trabalhista.', onde: "d.source IN ('camara', 'senado')",
    facetas: [{ id: 'fonte', rotulo: 'Casa', expr: "CASE d.source WHEN 'camara' THEN 'Câmara dos Deputados' ELSE 'Senado Federal' END", ordem: 'asc' }] },

  { id: 'noticias-setor', nome: 'Notícias do setor', ala: 'setor', icone: 'globe', ordem: 'data',
    descricao: 'TST, World Employment Confederation, IBGE e notícias do Ministério do Trabalho e Emprego.', onde: "(d.source IN ('tst', 'wec', 'ibge') OR (d.source = 'mte' AND json_extract(d.meta, '$.kind') = 'noticia'))",
    facetas: [{ id: 'fonte', rotulo: 'Fonte', expr: "CASE d.source WHEN 'tst' THEN 'TST' WHEN 'wec' THEN 'WEC' WHEN 'ibge' THEN 'IBGE' ELSE 'Ministério do Trabalho' END", ordem: 'asc' }] },
  { id: 'orientacoes', nome: 'Orientações do Ministério', ala: 'setor', icone: 'compass', ordem: 'titulo', facetas: [],
    descricao: 'Páginas de assuntos do Ministério do Trabalho: inspeção, fiscalização, emprego e serviços ao empregador.', onde: "d.source = 'mte' AND json_extract(d.meta, '$.kind') = 'assunto' AND d.url NOT LIKE '%normas-regulamentadoras-vigentes/%'" },
  { id: 'indicadores', nome: 'Indicadores', ala: 'setor', icone: 'line-chart', ordem: 'titulo', facetas: [], especial: 'indicadores',
    descricao: 'Selic, IPCA, desocupação, volume de serviços e saldo do Novo CAGED, com a data de referência.' },

  { id: 'cerebro', nome: 'Conhecimento da SINDI', ala: 'sindi', icone: 'brain', ordem: 'titulo', facetas: [], especial: 'cerebro',
    descricao: 'Perguntas e respostas aprovadas, diretoria, glossário, conceitos do setor, regras e limites, mais os resumos gerados dos documentos.' },
];
export const estantePorId = (id: string) => ESTANTES.find(e => e.id === id);

/** Em que estante um documento da coleta está catalogado (usado nos resultados de busca). */
export function estanteDoDocumento(d: { source: string; section?: string | null; kind?: string | null; url: string }): string {
  if (d.source === 'sindeprestem') return ({ convencao: 'convencoes', cartilha: 'cartilhas', juridico: 'juridico', noticia: 'noticias', artigo: 'artigos' } as Record<string, string>)[d.section ?? ''] ?? 'institucional';
  if (d.source === 'mte') return d.url.includes('normas-regulamentadoras-vigentes/') ? 'normas' : d.kind === 'noticia' ? 'noticias-setor' : 'orientacoes';
  if (d.source === 'constituicao') return 'constituicao';
  if (d.source === 'regimentos') return 'regimentos';
  if (d.source === 'camara' || d.source === 'senado') return 'proposicoes';
  return 'noticias-setor';
}
