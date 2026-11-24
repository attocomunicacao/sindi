import { normalizar } from '@/lib/base/texto';
import { PEDIDO_DE_REDACAO, pedidoDeAjuda } from '@/lib/recuperacao/intencao';

// Casos individuais (demissão, multa, indenização) dependem de convenção e fatos concretos: sem fonte, não se improvisa resposta.
export function casoJuridicoIndividual(question: string): boolean {
  const q = normalizar(question);
  if (PEDIDO_DE_REDACAO.test(q)) return false;
  if (
    !/demit|demiss|rescis|justa causa|multa|indeniza|verbas rescis|reclamacao trabalhista|processo trabalhista|\bacao trabalhista|\bacao judicial|reclamatoria|processad[oa]|audiencia trabalhista|fired|dismiss|severance|lawsuit|penalty/.test(
      q,
    )
  )
    return false;
  // "Multa do FGTS", encargos e custo de contratar pertencem ao orçamento, não a um caso individual.
  if (/fgts|orcament|encargo|custo|quanto custa|tabela de referencia|budget/.test(q)) return false;
  return true;
}
/** Obrigações legais de contratação (cota de aprendizes ou de PcD, exigência de antecedentes): a SINDI não tem fonte validada e encaminha ao Setor Jurídico. */
export const obrigacaoLegalDeContratacao = (question: string) =>
  /(obrigad|posso (pedir|exigir)|pode (pedir|exigir)|precis\w* contratar|tenho que contratar).{0,50}(aprendiz|cota|pcd|deficien|antecedente)|(aprendiz|cota|pcd|deficien|antecedente).{0,40}(obrigat|obrigad|exigir|pedir)/.test(
    normalizar(question),
  );

const DOMINIO =
  /sindic|sindeprestem|sindi\b|terceiri|temporari|trabalh|emprego|empreg|contrat|funcion|empres|convenc|\bccts?\b|aditivo|cartilha|artigo|noticia|\blei\b|leis\b|juridic|direito|salari|piso|encargo|orcament|custo|posto|limpeza|portaria|zelador|recepcion|jardin|\bnr\b|nr-?\d|norma|caged|selic|ipca|inflacao|desemprego|pnad|ibge|\btst\b|camara|senado|constituicao|regimento|projeto|\bclt\b|reforma|jornada|escala|6x1|ferias|fgts|inss|tribut|imposto|\biss\b|\bpis\b|cofins|contribui|mensalidade|associ|filia|diretor|presidente|contato|telefone|endereco|horario|e-?mail|painel|ferramenta|servico|dirigent|entidade|assembleia|auditorio|estudio|certidao|clipping|curso|evento|cartao|boleto|parcela|capital social|colaborador|tomadora|prestadora|errata|piso|reajuste|correcao|data-base|bombeiro|leiturista|poupatempo|promotor|merchandising|esg|inovacao|suplente|conselho|gestao|cartilha|union|sindeprestem|outsourc|temporary|staffing|fee|dues|membership|contribution|collective|agreement|labou?r|employ|worker|office|opening|hours|president|director|board|legal|law|member|affiliat|associate|budget|quote|inflation|unemployment|interest rate|wage|salary|benefit|convention|contact|address|phone|news|article|facilities|seguranca do trabalho|epi\b|sindical|patronal|reajuste|dissidio|vale|beneficio|aprendiz|terceir|demiss|rescis|multa/;
// Vocabulário de perguntas sobre a própria SINDI e sobre o uso da ferramenta, e termos de custo e contato. A porta de escopo recusa antes de buscar,
// então ela precisa errar para o lado de deixar passar: uma recusa indevida custa mais do que uma resposta fraca.
const DOMINIO_SINDI =
  /\bsetor|mercado|relatorio|resumo executivo|indicador|proposta|\bvagas?\b|recrut|seletiv|entrevista|candidat|curricul|terceir|temporari|fenaserhtt|federac|assistente|\bvoce\b.*\b(sabe|faz|pode)|conversa|gravad|registrad|salv[ao]|\bdados\b|\bvoz\b|\bfal(ar|e|a)\b|\bligar\b|\bnumero\b|escritorio|\babert[oa]\b|\bsede\b|\brua\b|\bandar\b|whatsapp|\btaxa\b|negocial|vence|\bdsr\b|pcmso|\bbdi\b|periculos|insalubr|noturno|adicional|tabela|referencia|legislac|material|educativ|publica|opiniao|\btexto|\bsite\b|frequencia|atualiz|\bganha|acordo|advogad|funcionamento|mensal|cobranca|desconto|exame|medic|reserv|alugar|locacao|\bsala|dirigent|quem (comanda|lidera|assina) (a|o|os|as) (entidade|sindicato|texto|artigo)|\bgovernanca|sustentabilidade|divulgacao|imprensa|what time|which law/;
/**
 * Padrão seguro: sem fonte, a SINDI não deixa o modelo pequeno responder de memória sobre o setor. Só redação, tradução e orientação
 * ("como fazer") seguem livres. Defina SINDI_RESPOSTA_LIVRE=1 para voltar às respostas gerais sem fonte.
 */
export function semFonteSemChute(question: string): boolean {
  if (process.env.SINDI_RESPOSTA_LIVRE === '1' || pedidoDeAjuda(question) || normalizar(question).trim().length < 4)
    return false;
  return true;
}
/** Pergunta sem relação com o setor (o modelo recebe a situação e recusa com gentileza, sem responder ao pedido). */
export function foraDoEscopo(question: string): boolean {
  const q = normalizar(question);
  // Pedidos de ajuda geral, redação e tradução continuam com o modelo; só perguntas factuais fora do setor são recusadas.
  if (q.trim().length < 4 || pedidoDeAjuda(question) || DOMINIO.test(q) || DOMINIO_SINDI.test(q)) return false;
  return true;
}

// ── Fatos que a base sabidamente não tem ───────────────────────────────────────────────────────────────────────────────────────────
// O modelo pequeno completa lacunas com respostas plausíveis ("o sindicato não possui CNPJ"), e o verificador de fatos não enxerga afirmações sem número.
// Para atributos que as fontes não trazem, a ausência do dado nas evidências vira recusa. Acrescente aqui, com um teste, cada lacuna descoberta.
type Lacuna = { pergunta: RegExp; presente: RegExp };
const LACUNAS: Lacuna[] = [
  { pergunta: /\bcnpj\b/, presente: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/ },
  {
    pergunta:
      /(salario|remuneracao|holerite|quanto ganha|pro-?labore|subsidio).{0,40}(president|diretor|diretoria|dirigente|vice)|(president|diretor|diretoria|dirigente|vice).{0,40}(salario|remuneracao|holerite|quanto ganha|pro-?labore)/,
    presente: /$^/,
  },
  {
    pergunta: /(inscricao|registro|carta) (sindical|estadual|municipal)|\bcodigo sindical\b/,
    presente: /\d{3}\.\d{3}\.\d{3}|\bcarta sindical\b/,
  },
];
export function lacunaConhecida(question: string, evidencia: string): boolean {
  const q = normalizar(question);
  return LACUNAS.some((l) => l.pergunta.test(q) && !l.presente.test(evidencia));
}
