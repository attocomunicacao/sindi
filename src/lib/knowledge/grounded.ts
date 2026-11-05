import { normalize, queryTerms, type Passage } from './core';
export function cleanExcerpt(content: string): string {
  const lines = content.replace(/([\p{L}])-\s*\n\s*([\p{L}])/gu, '$1$2').split('\n');
  const short = lines.filter(line => line.trim() && line.trim().length < 55).length;
  if (/\b(indice|sumario|table of contents)\b/.test(normalize(content)) && short / Math.max(lines.length, 1) > 0.5) return '';
  return lines.filter(line => !/^\s*(\d+\s*|\d+\s*\|\s*SINDEPRESTEM|Rodapé institucional:)$/i.test(line))
    .join('\n').replace(/([^\n])\n(?=[\p{Ll}])/gu, '$1 ').trim();
}
export function sourceChoices(passages: Passage[], question: string, maximo = 4): Passage[] {
  const terms = queryTerms(question);
  return passages.map(p => ({ ...p, content: cleanExcerpt(p.content) })).filter(p => p.content.length > 50)
    .sort((a,b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || terms.filter(t => normalize(b.content).includes(t)).length - terms.filter(t => normalize(a.content).includes(t)).length).slice(0, maximo);
}
export function sourceReferences(choices: Passage[], language: string): string {
  const unique = [...new Map(choices.map(p => [p.url, p])).values()];
  if (!unique.length) return '';
  return '\n\n' + (language === 'en' ? 'References: ' : 'Referências: ') + unique.map(p => {
    const title = /\.pdf$/i.test(p.title) ? (language === 'en' ? 'SINDEPRESTEM publication' : 'Publicação do SINDEPRESTEM') : p.title;
    return `[${title.replace(/[\[\]\\]/g, '')}](${p.url})`;
  }).join(' · ');
}
// Casos individuais (demissão, multa, indenização) dependem de convenção e fatos concretos: sem fonte, não se improvisa resposta.
export function casoJuridicoIndividual(question: string): boolean {
  const q = normalize(question);
  if (/redij|escrev|reescrev|traduz|draft|write|translate/.test(q)) return false;
  if (!/demit|demiss|rescis|justa causa|multa|indeniza|verbas rescis|reclamacao trabalhista|processo trabalhista|\bacao trabalhista|\bacao judicial|reclamatoria|processad[oa]|audiencia trabalhista|fired|dismiss|severance|lawsuit|penalty/.test(q)) return false;
  // "Multa do FGTS", encargos e custo de contratar pertencem ao orçamento, não a um caso individual.
  if (/fgts|orcament|encargo|custo|quanto custa|tabela de referencia|budget/.test(q)) return false;
  return true;
}
/** Obrigações legais de contratação (cota de aprendizes ou de PcD, exigência de antecedentes): a SINDI não tem fonte validada e encaminha ao Setor Jurídico. */
export const obrigacaoLegalDeContratacao = (question: string) => /(obrigad|posso (pedir|exigir)|pode (pedir|exigir)|precis\w* contratar|tenho que contratar).{0,50}(aprendiz|cota|pcd|deficien|antecedente)|(aprendiz|cota|pcd|deficien|antecedente).{0,40}(obrigat|obrigad|exigir|pedir)/.test(normalize(question));

const DOMINIO = /sindic|sindeprestem|sindi\b|terceiri|temporari|trabalh|emprego|empreg|contrat|funcion|empres|convenc|\bccts?\b|aditivo|cartilha|artigo|noticia|\blei\b|leis\b|juridic|direito|salari|piso|encargo|orcament|custo|posto|limpeza|portaria|zelador|recepcion|jardin|\bnr\b|nr-?\d|norma|caged|selic|ipca|inflacao|desemprego|pnad|ibge|\btst\b|camara|senado|constituicao|regimento|projeto|\bclt\b|reforma|jornada|escala|6x1|ferias|fgts|inss|tribut|imposto|\biss\b|\bpis\b|cofins|contribui|mensalidade|associ|filia|diretor|presidente|contato|telefone|endereco|horario|e-?mail|painel|ferramenta|servico|dirigent|entidade|assembleia|auditorio|estudio|certidao|clipping|curso|evento|cartao|boleto|parcela|capital social|colaborador|tomadora|prestadora|errata|piso|reajuste|correcao|data-base|bombeiro|leiturista|poupatempo|promotor|merchandising|esg|inovacao|suplente|conselho|gestao|cartilha|union|sindeprestem|outsourc|temporary|staffing|fee|dues|membership|contribution|collective|agreement|labou?r|employ|worker|office|opening|hours|president|director|board|legal|law|member|affiliat|associate|budget|quote|inflation|unemployment|interest rate|wage|salary|benefit|convention|contact|address|phone|news|article|facilities|seguranca do trabalho|epi\b|sindical|patronal|reajuste|dissidio|vale|beneficio|aprendiz|terceir|demiss|rescis|multa/;
// Vocabulário de perguntas sobre a própria SINDI e sobre o uso da ferramenta, e termos de custo e contato. A porta de escopo recusa antes de buscar,
// então ela precisa errar para o lado de deixar passar: uma recusa indevida custa mais do que uma resposta fraca.
const DOMINIO_SINDI = /\bsetor|mercado|relatorio|resumo executivo|indicador|proposta|\bvagas?\b|recrut|seletiv|entrevista|candidat|curricul|terceir|temporari|fenaserhtt|federac|assistente|\bvoce\b.*\b(sabe|faz|pode)|conversa|gravad|registrad|salv[ao]|\bdados\b|\bvoz\b|\bfal(ar|e|a)\b|\bligar\b|\bnumero\b|escritorio|\babert[oa]\b|\bsede\b|\brua\b|\bandar\b|whatsapp|\btaxa\b|negocial|vence|\bdsr\b|pcmso|\bbdi\b|periculos|insalubr|noturno|adicional|tabela|referencia|legislac|material|educativ|publica|opiniao|\btexto|\bsite\b|frequencia|atualiz|\bganha|acordo|advogad|funcionamento|mensal|cobranca|desconto|exame|medic|reserv|alugar|locacao|\bsala|dirigent|quem (comanda|lidera|assina) (a|o|os|as) (entidade|sindicato|texto|artigo)|\bgovernanca|sustentabilidade|divulgacao|imprensa|what time|which law/;
const REDACAO =/redij|escrev|reescrev|traduz|draft|write|translate|melhore o texto/;
// Só tarefas de escrita e organização; "explique", "resuma" e "ajude" pedem fatos e dependem de fonte.
const AJUDA = /como (organizar|escrever|preparar|montar|melhorar|estruturar|planejar)|dica|apresenta[cç][aã]o|e-?mail|carta|oficio|modelo de|ideia|sugest|how to|tips/;
/** Redação, tradução e pedidos de orientação "como fazer": o modelo pode ajudar mesmo sem fonte, porque não afirmam fatos do sindicato. */
export function pedidoDeAjuda(question: string) { const q = normalize(question); return REDACAO.test(q) || AJUDA.test(q); }
/**
 * Padrão seguro: sem fonte, a SINDI não deixa o modelo pequeno responder de memória sobre o setor. Só redação, tradução e orientação
 * ("como fazer") seguem livres. Defina SINDI_RESPOSTA_LIVRE=1 para voltar às respostas gerais sem fonte.
 */
export function semFonteSemChute(question: string): boolean {
  if (process.env.SINDI_RESPOSTA_LIVRE === '1' || pedidoDeAjuda(question) || normalize(question).trim().length < 4) return false;
  return true;
}
/** Pergunta sem relação com o setor (o modelo recebe a situação e recusa com gentileza, sem responder ao pedido). */
export function foraDoEscopo(question: string): boolean {
  const q = normalize(question);
  // Pedidos de ajuda geral, redação e tradução continuam com o modelo; só perguntas factuais fora do setor são recusadas.
  if (q.trim().length < 4 || pedidoDeAjuda(question) || DOMINIO.test(q) || DOMINIO_SINDI.test(q)) return false;
  return true;
}

/** Contatos e domínio oficiais: sempre permitidos numa resposta, mesmo que o trecho entregue ao modelo não os contenha. */
export const CONTATOS_OFICIAIS = ['sindeprestem@sindeprestem.com.br', 'juridico@sindeprestem.com.br', '(11) 3215-8250', '(11) 99205-3371', 'sindeprestem.com.br', 'Av. São Luís, 258'];
export type Verificacao = { ok: boolean; inventados: string[] };
const soDigitos = (t: string) => t.replace(/\D/g, '');
const compacta = (t: string) => normalize(t).replace(/\s+/g, '');

/**
 * Verificador de fatos para modelos pequenos: e-mails, endereços de site, telefones, valores em reais e números de lei que aparecem na resposta
 * precisam constar nas fontes entregues ao modelo (ou nos contatos oficiais). Qualquer um que não conste indica invenção.
 */
export function verificarFatos(resposta: string, fontes: string, pergunta = ''): Verificacao {
  const base = compacta(`${fontes} ${CONTATOS_OFICIAIS.join(' ')}`); const digitos = soDigitos(`${fontes} ${CONTATOS_OFICIAIS.join(' ')}`);
  const inventados: string[] = [];
  const confere = (achados: string[], presente: (item: string) => boolean) => { for (const item of achados) if (!presente(item)) inventados.push(item); };
  confere(resposta.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [], e => base.includes(compacta(e)));
  confere((resposta.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|gov|jus|leg|edu)(?:\.[a-z]{2})?\b/gi) ?? []).filter(d => !/@/.test(d)),
    d => /\.(?:gov|jus|leg)\.br$/i.test(d) || base.includes(compacta(d.replace(/^https?:\/\//i, '').replace(/^www\./i, ''))));
  confere(resposta.match(/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g) ?? [], t => digitos.includes(soDigitos(t)));
  confere(resposta.match(/R\$\s?[\d.]+(?:,\d{2})?/g) ?? [], v => base.includes(compacta(v.replace(/^R\$\s?/, ''))));
  // Número de norma só vale se aparece inteiro, como número, nas fontes; uma sequência de dígitos que atravessa outros números não conta.
  const numerosDasFontes = new Set((fontes.match(/\d+(?:\.\d{3})*/g) ?? []).map(soDigitos));
  confere((resposta.match(/\b(?:Lei|Decreto|Portaria)[^\d]{0,12}[\d.]{3,}/gi) ?? []).map(l => l.replace(/^[^\d]*/, '').replace(/\.$/, '')), n => numerosDasFontes.has(soDigitos(n)));
  // Números: percentuais, valores com casas decimais e números de três dígitos ou mais (anos, quantidades, saldos) precisam constar nas fontes ou na própria pergunta.
  // É a proteção contra o erro típico de modelo pequeno de trocar "44 horas" por "40" ou criar uma estatística; listas numeradas e números de um ou dois dígitos ficam de fora.
  const numerosDe = (texto: string) => texto.match(/\d+(?:[.,]\d+)*/g) ?? [];
  const conhecidos = new Set(numerosDe(`${fontes} ${pergunta} ${CONTATOS_OFICIAIS.join(' ')}`).map(soDigitos)); conhecidos.add(String(new Date().getFullYear()));
  confere((resposta.match(/\d+(?:[.,]\d+)*(?:\s?%)?/g) ?? []).filter(n => /%|[.,]\d/.test(n) || soDigitos(n).length >= 3), n => conhecidos.has(soDigitos(n)));
  return { ok: inventados.length === 0, inventados: [...new Set(inventados)] };
}

// ── Dados pessoais e confidenciais ────────────────────────────────────────────────────────────────────────────────────────────────
// A SINDI não grava conversas, mas o texto ainda passa pelo modelo e pelo histórico da sessão. Por isso, ao detectar CPF, cartão, senha ou
// token, a pergunta não chega ao modelo e o trecho é removido do histórico. A decisão é por regras no servidor, fora do modelo.
const luhn = (digitos: string) => { let soma = 0; let dobra = false; for (let i = digitos.length - 1; i >= 0; i--) { let n = Number(digitos[i]); if (dobra) { n *= 2; if (n > 9) n -= 9; } soma += n; dobra = !dobra; } return soma % 10 === 0; };
const CPF_FORMATADO = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g;
const CPF_ROTULADO = /\b(?:cpf|rg|cnh|passaporte)\b[^\d\n]{0,15}\d[\d.\-/ ]{5,}\d/gi;
const SEGREDO_ROTULADO = /\b(?:senha|password|token|cvv|pin|chave de api|api key|c[oó]digo de seguran[cç]a)\b\s*(?:[:=]|(?:\w+\s+){0,3}(?:é|e|eh|is)\s)\s*(?=\S*\d)\S+/gi;
const CARTAO = /(?<![\d.])(?:\d[ -]?){12,18}\d(?![\d.])/g;
/** Trechos de `texto` que parecem dado pessoal ou segredo (CPF, documento rotulado, cartão válido pelo algoritmo de Luhn, senha ou token informados). */
function achadosSensiveis(texto: string): string[] {
  const achados = [...(texto.match(CPF_FORMATADO) ?? []), ...(texto.match(CPF_ROTULADO) ?? []), ...(texto.match(SEGREDO_ROTULADO) ?? [])];
  for (const candidato of texto.match(CARTAO) ?? []) { const digitos = candidato.replace(/\D/g, ''); if (digitos.length >= 13 && digitos.length <= 19 && luhn(digitos)) achados.push(candidato); }
  return achados;
}
export function contemDadosSensiveis(texto: string): boolean { return achadosSensiveis(texto).length > 0; }
/** Remove do texto os dados pessoais e segredos detectados, para que não voltem ao modelo pelo histórico da conversa. */
export function redigirDadosSensiveis(texto: string): string {
  return achadosSensiveis(texto).reduce((atual, achado) => atual.split(achado).join('[dado sensível removido]'), texto);
}


// ── Fatos que a base sabidamente não tem ───────────────────────────────────────────────────────────────────────────────────────────
// O modelo pequeno completa lacunas com respostas plausíveis ("o sindicato não possui CNPJ"), e o verificador de fatos não enxerga afirmações sem número.
// Para atributos que as fontes não trazem, a ausência do dado nas evidências vira recusa. Acrescente aqui, com um teste, cada lacuna descoberta.
type Lacuna = { pergunta: RegExp; presente: RegExp };
const LACUNAS: Lacuna[] = [
  { pergunta: /\bcnpj\b/, presente: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/ },
  { pergunta: /(salario|remuneracao|holerite|quanto ganha|pro-?labore|subsidio).{0,40}(president|diretor|diretoria|dirigente|vice)|(president|diretor|diretoria|dirigente|vice).{0,40}(salario|remuneracao|holerite|quanto ganha|pro-?labore)/, presente: /$^/ },
  { pergunta: /(inscricao|registro|carta) (sindical|estadual|municipal)|\bcodigo sindical\b/, presente: /\d{3}\.\d{3}\.\d{3}|\bcarta sindical\b/ },
];
export function lacunaConhecida(question: string, evidencia: string): boolean {
  const q = normalize(question);
  return LACUNAS.some(l => l.pergunta.test(q) && !l.presente.test(evidencia)) ;
}

// ── Situações em que o modelo escreve com uma orientação, em vez de a SINDI devolver um texto fixo ──────────────────────────────
// A SINDI decide a situação (por regras no servidor, fora do modelo) e entrega ao modelo uma nota com o que fazer e o que não fazer; a resposta é sempre escrita pelo modelo.
export type Situacao = 'saudacao' | 'dados-sensiveis' | 'caso-juridico' | 'fora-do-escopo' | 'sem-fonte' | 'correcao';
const NOTAS: Record<Situacao, string> = {
  saudacao: 'SITUAÇÃO: saudação. Cumprimente com simpatia, apresente-se como SINDI, assistente virtual do SINDEPRESTEM, e pergunte como pode ajudar. Uma ou duas frases.',
  'dados-sensiveis': 'SITUAÇÃO: o usuário enviou dado pessoal ou confidencial (CPF, cartão, senha ou token), que já foi removido da conversa. Peça com gentileza que não envie esse tipo de dado, diga que a SINDI não guarda nem usa dados assim e ofereça ajuda com a dúvida sem eles. Não repita nem confirme nenhum dado e não diga que anotou ou guardou algo.',
  'caso-juridico': 'SITUAÇÃO: caso jurídico individual (demissão, multa, rescisão, ação trabalhista ou aplicação de cláusula a um caso concreto). Não opine, não calcule valores e não diga o que é permitido ou obrigatório. Explique em poucas frases que a resposta depende do caso concreto e da convenção coletiva aplicável e encaminhe ao Setor Jurídico do SINDEPRESTEM, informando o telefone e o e-mail das fontes.',
  'fora-do-escopo': 'SITUAÇÃO: pergunta fora do escopo da SINDI. Explique com gentileza, sem responder ao pedido, que você ajuda com terceirização e trabalho temporário, com o sindicato (contatos, contribuições, convenções, diretoria), documentos jurídicos, indicadores, notícias e o orçamento de terceirização. Uma ou duas frases.',
  'sem-fonte': 'SITUAÇÃO: não há fonte oficial que responda a esta pergunta. Diga em uma ou duas frases que não conseguiu confirmar essa informação nas fontes oficiais e indique o contato do SINDEPRESTEM que consta das fontes. Não invente nem estime números, valores, nomes, datas, leis ou endereços.',
  correcao: 'CORREÇÃO: a resposta anterior continha informações (contatos, endereços, valores ou leis) que não constam das fontes. Escreva de novo usando SOMENTE o que as fontes dizem; se elas não bastarem, diga que não conseguiu confirmar e indique o contato.',
};
export const notaDaSituacao = (situacao: Situacao) => `\n${NOTAS[situacao]}\n`;
/** Contato oficial como fonte (dado, não resposta): o modelo o usa ao encaminhar o usuário, e a referência aponta para a página de contato. */
export const trechoDeContato = (): Passage => ({ url: 'https://www.sindeprestem.com.br/contato', title: 'Contato do SINDEPRESTEM', fetchedAt: new Date().toISOString(), pinned: true,
  content: 'Contatos do SINDEPRESTEM: telefone (11) 3215-8250; e-mail sindeprestem@sindeprestem.com.br; Setor Jurídico e Gerência: (11) 3215-8250, juridico@sindeprestem.com.br; comunicação (WhatsApp): (11) 99205-3371. Atendimento de segunda a sexta, das 08:30 às 17:30. Endereço: Av. São Luís, 258, 18º andar, Centro Histórico de São Paulo.' });
