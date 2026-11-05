// Gera os arquivos autogerados do cérebro da SINDI (cerebro/auto/*.md) a partir dos dados coletados.
// Os arquivos curados, na pasta cerebro/, nunca são alterados por esta geração.
import type { Db } from '../dados/db';
import { contactFromSource } from '../knowledge/retrieve';

const SITE = 'https://www.sindeprestem.com.br';
const formatarFaixa = (faixa: string) => {
  const m = faixa.match(/^(R\$ [\d.,]+) (R\$ [\d.,]+) (12 Parcelas de R\$ [\d.,]+)$/);
  return m ? `capital social de ${m[1]} até ${m[2]}: ${m[3].replace('Parcelas', 'parcelas')}` : faixa.replace('Parcelas', 'parcelas').replace(/^Empresas sem colaboradores/, 'empresas sem colaboradores:').replace(/^Acima de/, 'capital social acima de');
};

/** Gera todos os arquivos autogerados em memória: { "institucional.md": "...", ... }. */
export function gerarArquivos(db: Db, hoje = new Date().toISOString().slice(0, 10)): Record<string, string> {
  const arquivos: Record<string, string> = {};
type Linha = { title: string; url: string; content: string; published_at: string | null; category: string | null; year: number | null; type: string | null; region: string | null };
const consulta = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Linha[];
const base = `SELECT title, url, content, published_at, json_extract(meta,'$.category') AS category, json_extract(meta,'$.year') AS year, json_extract(meta,'$.type') AS type, json_extract(meta,'$.region') AS region FROM documents`;
const pagina = (caminho: string) => (db.prepare("SELECT content FROM documents WHERE source = 'sindeprestem' AND url LIKE ?").get('%' + caminho) as { content: string } | undefined)?.content.split('Rodapé institucional')[0] ?? '';
const linhasDe = (texto: string) => texto.split('\n').map(l => l.trim()).filter(Boolean);
const compacto = (texto: string, limite: number) => { const t = texto.replace(/\s+/g, ' ').trim(); return t.length > limite ? t.slice(0, limite).replace(/\s+\S*$/, '') + ' […]' : t; };
const data = (v: string | null) => v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 's/d';
const cabecalho = (titulo: string, fonte: string, gatilhos: string[], prioridade = 1) => `---\ntitulo: ${titulo}\nfonte: ${fonte}\natualizado: ${hoje}\ntipo: autogerado\nprioridade: ${prioridade}\ngatilhos: ${gatilhos.join(', ')}\n---\n\n<!-- AUTOGERADO por src/lib/cerebro/gerar.ts em ${hoje}. Não edite: as alterações serão perdidas. Para ajustar regras e respostas, edite os arquivos da pasta cerebro/. -->\n\n`;
const gravar = (arquivo: string, texto: string) => { arquivos[arquivo] = texto.trimEnd() + String.fromCharCode(10); };
const sem = (texto: string, ...padroes: RegExp[]) => padroes.reduce((t, p) => t.replace(p, ''), texto);

// 1. Institucional
{
  const inst = linhasDe(pagina('/institucional-do-sindeprestem-sindicat'));
  const bloco = (titulo: string) => { const i = inst.findIndex(l => l === titulo); return i >= 0 ? inst[i + 1] : ''; };
  const contato = contactFromSource(pagina('/contato') + '\nRodapé institucional: ' + (db.prepare("SELECT content FROM documents WHERE source='sindeprestem' AND url LIKE '%/contato'").get() as { content: string }).content.split('Rodapé institucional')[1], 'pt') ?? '';
  const rodape = (db.prepare("SELECT content FROM documents WHERE source='sindeprestem' AND url LIKE '%/contato'").get() as { content: string }).content;
  const endereco = rodape.match(/(?:Av\.|Avenida|Rua)\s+[^\n]{3,160}?São Paulo\s*[-–,]\s*SP/i)?.[0] ?? '';
  const associe = linhasDe(pagina('/associe'));
  const lista = (de: string, ate: string) => { const a = associe.findIndex(l => l === de); const b = associe.findIndex((l, i) => i > a && l === ate); return associe.slice(a + 1, b > a ? b : a + 14).filter(l => /^[✔✕]/.test(l)).map(l => `- ${l.replace(/^✔\s*/, '').replace(/^✕\s*/, 'Não: ')}`); };
  const conecta = linhasDe(pagina('/conecta')).join(' ');
  const quem = conecta.match(/O Sindeprestem representa mais de [^.]*\.\s*Há [^.]*\./)?.[0] ?? '';
  const temporario = associe.find(l => /^Regulamentado pela Lei Federal/.test(l)) ?? '';
  gravar('institucional.md', cabecalho('SINDEPRESTEM — institucional', `${SITE}/institucional-do-sindeprestem-sindicat`, ['sindeprestem', 'sindicato', 'quem somos', 'o que é', 'missão', 'visão', 'valores', 'diretoria', 'presidente', 'história', 'fenaserhtt', 'associado', 'filiado', 'benefícios', 'endereço', 'telefone', 'contato', 'horário'], 2) +
`## O que é o SINDEPRESTEM
${inst[0]}.

${bloco('Sobre o SINDEPRESTEM')}

${quem}

## Missão, visão e valores
- **Missão:** ${bloco('Missão')}
- **Visão:** ${bloco('Visão')}
- **Valores:** ${bloco('Valores')}

## Presidente e diretoria
O presidente é Vander Morales (também presidente da FENASERHTT). A composição completa da diretoria (gestão 2026–2029) está no arquivo curado de diretoria.

## Contatos, endereço e horário
${contato}

Endereço: ${endereco}.

## Benefícios para empresas associadas e filiadas
**Empresa associada** (participa das assembleias; contribuição associativa, confederativa e negocial):
${lista('EMPRESA ASSOCIADA', 'EMPRESA FILIADA').join('\n')}

**Empresa filiada** (não participa das assembleias; contribuição confederativa e negocial):
${lista('EMPRESA FILIADA', 'Atividades setoriais').join('\n')}

## Trabalho temporário na página do sindicato
${temporario}
`);
}

// 2. Contribuições
{
  const texto = pagina('/contribuicao-sindical'); const linhas = linhasDe(texto);
  const regulamento = linhas.find(l => /^A Contribuição Patronal vigente/.test(l)) ?? '';
  const secao = (titulo: string) => {
    const i = texto.indexOf(`${titulo}\n\nFaixas`); if (i < 0) return '';
    const fim = texto.indexOf('Contribuição', i + 40); const bloco = texto.slice(i, fim > i ? fim : i + 2500);
    const itens = bloco.split('\n').map(l => l.trim()).filter(Boolean); const faixas: string[] = []; let buffer: string[] = [];
    for (const l of itens.slice(1)) { if (/^(Faixas|Capital Social|Até|Capital|Parcela)$/.test(l) || /^\d{1,2}$/.test(l)) continue; buffer.push(l); if (/Parcelas? de/i.test(l)) { faixas.push(buffer.filter(x => x !== '—').join(' ')); buffer = []; } }
    return faixas.map(f => `- ${formatarFaixa(f)}`).join('\n');
  };
  const valorApos = (rotulo: string) => { const i = linhas.findIndex(l => l === rotulo); return i >= 0 ? linhas[i + 1] : ''; };
  const teto = linhas.find(l => /^\(\*\)\s*-\s*Teto/i.test(l)) ?? '';
  const negocial = [`trabalhador temporário: ${valorApos('Trabalhador temporário')} por mês`, `trabalhador celetista: ${valorApos('Trabalhador celetista')} por mês`, teto.replace(/^\(\*\)\s*-\s*/, '')];
  gravar('contribuicoes.md', cabecalho('Contribuições do SINDEPRESTEM', `${SITE}/contribuicao-sindical`, ['contribuição', 'contribuições', 'mensalidade', 'associativa', 'confederativa', 'negocial', 'valor', 'tabela', 'quanto custa', 'vencimento', 'boleto', 'cartão de crédito', 'capital social', 'filiação', 'associação'], 2) +
`## Regulamento e vencimentos
${regulamento}

- **Contribuição associativa:** aplicável apenas a empresas associadas; mensal, conforme o capital social da empresa; vence todo dia 15.
- **Contribuição confederativa:** obrigatória para associadas e filiadas; mensal, conforme o capital social; vence todo dia 30.
- **Contribuição negocial patronal:** obrigatória para associadas e filiadas; mensal, conforme a quantidade de colaboradores celetistas e temporários; vence todo dia 10; limitada a 1.600 colaboradores por CNPJ.

## Tabela da contribuição associativa (12 parcelas por ano)
${secao('Contribuição associativa')}

## Contribuição negocial patronal (12 parcelas por ano)
${negocial.map(l => `- ${l}`).join('\n')}

## Tabela da contribuição confederativa (12 parcelas por ano)
${secao('Contribuição confederativa')}

## Formas de pagamento
Boleto bancário: gerado na página de contribuição; pagamento até o vencimento. Cartão de crédito: disponível; para ativar, procurar o setor financeiro do SINDEPRESTEM.
`);
}

// 3. Convenções coletivas
{
  const todas = consulta(`${base} WHERE source = 'sindeprestem' AND json_extract(meta,'$.section') = 'convencao' AND url LIKE '%.pdf' ORDER BY COALESCE(json_extract(meta,'$.year'),0) DESC, title`);
  const categorias = [...new Set(todas.map(c => c.category ?? 'Outras'))].filter(c => c !== 'Outras').sort();
  const clausula = (texto: string, padrao: RegExp, limite: number) => { const m = texto.match(padrao); return m ? compacto(m[0], limite) : ''; };
  const secoes = categorias.map(categoria => {
    const docs = todas.filter(c => c.category === categoria && c.region !== 'Jundiaí');
    const vigente = docs.find(d => d.type === 'Convenção coletiva' && (d.year ?? 0) >= 2025 && d.content.length > 2000);
    const recentes = docs.filter(d => (d.year ?? 0) >= 2025).slice(0, 8);
    const salarios = vigente ? clausula(vigente.content, /CL[ÁA]USULA\s+\S+\s*[-–]\s*SAL[ÁA]RIOS?\s+(?:PROFISSIONAIS|NORMATIVO[S]?|BASE)[\s\S]{0,1800}/i, 1100) : '';
    const correcao = vigente ? clausula(vigente.content, /CL[ÁA]USULA\s+\S+\s*[-–]\s*CORRE[ÇC][ÃA]O\s+SALARIAL[\s\S]{0,900}/i, 650) : '';
    return `## ${categoria}
Documentos recentes (2025 em diante) da categoria **${categoria}**:
${recentes.map(d => `- [${d.title}](${d.url})`).join('\n') || '- (nenhum documento recente na página)'}
${vigente ? `\nTrecho literal da cláusula de salários em [${vigente.title}](${vigente.url}) (confira o documento e os aditivos):\n> ${salarios || 'cláusula não localizada no texto extraído; consulte o documento.'}\n${correcao ? `\nTrecho literal da cláusula de correção salarial:\n> ${correcao}\n` : ''}` : ''}`;
  });
  const anos = todas.map(c => c.year ?? 0).filter(Boolean);
  gravar('convencoes.md', cabecalho('Convenções coletivas do SINDEPRESTEM', `${SITE}/convencoes-coletivas`, ['convenção', 'convenções', 'convenção coletiva', 'cct', 'aditivo', 'comunicado', 'errata', 'piso', 'piso salarial', 'salário', 'reajuste', 'correção salarial', 'data-base', 'categoria', 'geral', 'portaria', 'poupatempo', 'promoção', 'merchandising', 'leiturista', 'promotores', 'bombeiros', 'jundiaí', 'quanto ganha'], 3) +
`## Como funcionam as convenções no site
O SINDEPRESTEM publica convenções coletivas de trabalho (CCT), aditivos, errata e comunicados conjuntos na página [Documentos coletivos](${SITE}/convencoes-coletivas). São ${todas.length} documentos em PDF, de ${Math.min(...anos)} a ${Math.max(...anos)}, para São Paulo e Jundiaí. Categorias: ${categorias.join(', ')}.

A convenção Geral do SINDEPRESTEM exclui, entre outros, trabalhadores de empresas de asseio e conservação, higiene e limpeza pública urbana, da construção civil e de vigilância e segurança patrimonial, que têm convenções próprias de outras entidades.

${secoes.join('\n\n')}
`);
}

// 4. Jurídico
{
  const docs = consulta(`${base} WHERE source = 'sindeprestem' AND json_extract(meta,'$.section') = 'juridico' AND url LIKE '%.pdf' ORDER BY title`);
  const grupos = new Map<string, Linha[]>();
  for (const d of docs) { const chave = d.title.split(' — ')[0]; grupos.set(chave, [...(grupos.get(chave) ?? []), d]); }
  gravar('juridico.md', cabecalho('Documentos jurídicos publicados pelo SINDEPRESTEM', `${SITE}/juridico`, ['jurídico', 'legislação', 'lei', 'decreto', 'portaria', 'medida provisória', 'processos judiciais', '6.019', 'trabalho temporário', 'feriados', 'comércio'], 2) +
`## O que a página Jurídico oferece
A página [Jurídico](${SITE}/juridico) dá "acesso às legislações, processos judiciais e documentos oficiais do setor", organizados em Leis Ordinárias, Portarias, Decretos e Processos Judiciais. Há ${docs.length} documentos em PDF. A SINDI lista e cita esses documentos; ela não faz parecer jurídico.

## Documentos
${[...grupos.entries()].map(([norma, lista]) => `- **${norma}** — ${lista.length} arquivo(s): ${lista.slice(0, 3).map(d => `[${d.title.includes(' — ') ? d.title.split(' — ')[1] : d.title}](${d.url})`).join(', ')}${lista.length > 3 ? ', …' : ''}`).join('\n')}
`);
}

// 5. Cartilhas
{
  const docs = consulta(`${base} WHERE source = 'sindeprestem' AND json_extract(meta,'$.section') = 'cartilha' AND url LIKE '%.pdf' ORDER BY title`);
  gravar('cartilhas.md', cabecalho('Cartilhas do SINDEPRESTEM', `${SITE}/cartilhas`, ['cartilha', 'cartilhas', 'guia', 'esg', 'bombeiro civil', 'trabalho temporário', 'lei 13.429', 'material', 'orientação'], 2) +
`## Cartilhas disponíveis
"Conteúdos informativos produzidos para orientar empresas, associados e profissionais sobre temas relevantes do setor" ([página Cartilhas](${SITE}/cartilhas)).

${docs.map(d => { const texto = d.content.replace(/\s+/g, ' ').trim(); const util = !/sem texto extraível/.test(texto);
  return `### ${d.title}\n[Abrir PDF](${d.url})${util ? `\nInício do texto: ${compacto(texto.replace(/^[^A-Za-zÀ-ú]*/, ''), 420)}` : '\nPDF digitalizado (imagem): o texto não está disponível para a SINDI; consulte o documento.'}`; }).join('\n\n')}
`);
}

// 6. Artigos e notícias
{
  const artigos = consulta(`${base} WHERE source = 'sindeprestem' AND json_extract(meta,'$.section') = 'artigo' AND url LIKE '%/post/%' AND published_at IS NOT NULL ORDER BY published_at DESC`);
  const noticias = consulta(`${base} WHERE source = 'sindeprestem' AND json_extract(meta,'$.section') = 'noticia' AND url LIKE '%/post/%' AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 40`);
  const lead = (c: string) => compacto(sem(c, /Por Vander Morales[^\n]*/g), 330);
  gravar('artigos-e-noticias.md', cabecalho('Artigos do presidente e notícias do SINDEPRESTEM', `${SITE}/artigos`, ['artigo', 'artigos', 'vander morales', 'presidente', 'opinião', 'notícia', 'notícias', 'novidades', 'posicionamento', '6x1', 'escala', 'reforma', 'clt', 'nr-1', 'pec do emprego', 'jornada', 'custo brasil', 'inclusão'], 2) +
`## Artigos assinados pelo presidente (${artigos.length})
Artigos de Vander Morales, presidente do SINDEPRESTEM, com "análises e reflexões sobre os principais temas em evidência no setor" ([página Artigos](${SITE}/artigos)). Indicam o posicionamento do sindicato sobre cada tema.

${artigos.map(a => `- **${a.title.replace(/^Artigo\s*[-–]\s*/i, '')}** (${data(a.published_at)}) — ${lead(a.content)} [ler](${a.url})`).join('\n')}

## Notícias mais recentes
${noticias.map(n => `- **${n.title}** (${data(n.published_at)}) [ler](${n.url})`).join('\n')}

Todas as notícias desde 2020 estão em [${SITE}/noticias](${SITE}/noticias).
`);
}

// 7. Fontes de dados
{
  const contagens = new Map((db.prepare('SELECT source, COUNT(*) AS n, MAX(fetched_at) AS ultima FROM documents GROUP BY source').all() as { source: string; n: number; ultima: string }[]).map(r => [r.source, r]));
  const linha = (id: string, nome: string, descricao: string, cadencia: string) => `- **${nome}** (${contagens.get(id)?.n ?? 0} documentos; última coleta ${data(contagens.get(id)?.ultima ?? null)}): ${descricao} Atualização: ${cadencia}.`;
  gravar('fontes-de-dados.md', cabecalho('Fontes de dados que alimentam a SINDI', `${SITE}`, ['fontes', 'dados', 'indicadores', 'selic', 'ipca', 'desemprego', 'caged', 'ibge', 'tst', 'câmara', 'senado', 'constituição', 'regimento', 'ministério do trabalho', 'wec', 'painel', 'de onde vêm', 'atualização', 'coleta'], 1) +
`## De onde vêm as informações
A SINDI coleta dados públicos de fontes oficiais e os guarda neste computador, sem enviar conversas a terceiros. O [Painel](/painel) mostra indicadores e novidades; o chat usa os textos coletados e cita a fonte.

${linha('sindeprestem', 'SINDEPRESTEM', 'site oficial do sindicato (páginas, notícias, artigos, convenções, jurídico, cartilhas, contribuições e contato).', 'a cada 15 minutos (coleta de conhecimento) e 30 minutos (cópia para o painel)')}
${linha('ibge', 'IBGE', 'desocupação (PNAD Contínua), IPCA mensal e em 12 meses, volume de serviços (PMS) e notícias.', 'a cada 30 minutos; os indicadores são mensais')}
- **Banco Central**: meta da taxa Selic (data de início da vigência e meta anterior). Atualização: a cada 30 minutos.
${linha('camara', 'Câmara dos Deputados', 'proposições sobre terceirização, trabalho temporário, jornada, 6x1, contribuição sindical e reforma trabalhista, com situação e último andamento (API de dados abertos).', 'a cada 30 minutos')}
${linha('senado', 'Senado Federal', 'matérias com os mesmos temas (API de dados abertos).', 'a cada 30 minutos')}
${linha('tst', 'Tribunal Superior do Trabalho', 'notícias e decisões divulgadas.', 'a cada 30 minutos (apenas páginas novas)')}
${linha('wec', 'World Employment Confederation', 'notícias e publicações do setor de trabalho temporário (em inglês).', 'a cada 30 minutos (apenas páginas novas)')}
${linha('mte', 'Ministério do Trabalho e Emprego', 'notícias e páginas de assuntos, incluindo as Normas Regulamentadoras (NR-1 a NR-38).', 'notícias a cada 30 minutos; assuntos revisados a cada 7 dias')}
${linha('caged', 'Novo CAGED', 'saldo mensal de empregos formais (Brasil, São Paulo, serviços administrativos e locação de mão de obra temporária).', 'verificação a cada hora; o dado é mensal')}
${linha('constituicao', 'Constituição Federal', 'texto compilado, um documento por artigo, mais o ADCT.', 'diária')}
${linha('regimentos', 'Regimentos', 'Regimento Interno da Câmara, do Senado e Regimento Comum do Congresso, um documento por artigo.', 'semanal')}

## Limites
- Os indicadores mensais (IPCA, PNAD, CAGED) só mudam quando o órgão divulga um novo mês.
- O saldo do CAGED é o do arquivo mensal de movimentações, sem ajustes posteriores.
- A SINDI não determina a vigência jurídica de normas nem a situação atual de projetos: indica o link oficial para conferir.
`);
}
  return arquivos;
}
