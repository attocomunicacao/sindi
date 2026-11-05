import { FUNCOES } from './catalogo';
import { calcularOrcamento, type PostoEntrada } from './calculo';

const norm = (texto: string) => texto.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const NUMEROS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, quinze: 15, vinte: 20 };

// Sinônimos mais longos primeiro, para "auxiliar de limpeza" vencer "limpeza".
const SINONIMOS = FUNCOES.flatMap(f => f.sinonimos.map(s => ({ id: f.id, termo: norm(s) }))).sort((a, b) => b.termo.length - a.termo.length);
const termosFuncao = SINONIMOS.map(s => s.termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const TOKENS = new RegExp(`(?<![\\w])(?:(\\d{1,3}(?!\\d)|${Object.keys(NUMEROS).filter(n => n !== 'um' && n !== 'uma').join('|')}|(?:um|uma)(?=\\s+(?:${termosFuncao.join('|')})))(?![\\d.,]*\\s*(?:m2|metros))|(${termosFuncao.join('|')})s?|(diurnos?|noturnos?|(?:turno|periodo) (?:da )?(?:noite|dia)))(?![\\w])`, 'g');

export type PostoInterpretado = { funcaoId: string; quantidade: number; turno: 'diurno' | 'noturno' };
export type Interpretacao = { postos: PostoInterpretado[]; metrosQuadrados?: number; ajustados?: string[] };

/** "preciso de 3 auxiliares de limpeza diurno e 3 noturno" vira postos; sem função reconhecida, devolve undefined. */
export function interpretarPostos(pergunta: string): Interpretacao | undefined {
  const q = norm(pergunta);
  const area = q.match(/(\d[\d.]*(?:,\d+)?)\s*(?:m2|metros quadrados|m 2)/);
  const metrosQuadrados = area ? Number(area[1].replace(/\./g, '').replace(',', '.')) : undefined;
  const postos: PostoInterpretado[] = []; let quantidade: number | undefined; let ultimaFuncao: string | undefined; let atual: PostoInterpretado | undefined;
  for (const m of q.matchAll(TOKENS)) {
    if (m[1] !== undefined) { quantidade = NUMEROS[m[1]] ?? Number(m[1]); atual = undefined; continue; }
    if (m[2] !== undefined) {
      const id = SINONIMOS.find(s => s.termo === m[2])?.id; if (!id) continue;
      ultimaFuncao = id;
      if (quantidade) { atual = { funcaoId: id, quantidade, turno: 'diurno' }; postos.push(atual); quantidade = undefined; }
      continue;
    }
    const turno = /noite|noturn/.test(m[3]) ? 'noturno' : 'diurno';
    if (quantidade && ultimaFuncao) { atual = { funcaoId: ultimaFuncao, quantidade, turno }; postos.push(atual); quantidade = undefined; }
    else if (atual) atual.turno = turno;
  }
  const ajustados: string[] = [];
  const validos = postos.filter(p => p.quantidade > 0 && p.quantidade <= 500).map(p => {
    const funcao = FUNCOES.find(f => f.id === p.funcaoId)!;
    if (p.turno === 'noturno' && !funcao.permiteNoturno) { ajustados.push(funcao.nome); return { ...p, turno: 'diurno' as const }; }
    return p;
  });
  if (!validos.length) return undefined;
  // Postos iguais (mesma função e turno) são somados.
  const somados = new Map<string, PostoInterpretado>();
  for (const p of validos) { const chave = `${p.funcaoId}:${p.turno}`; const existente = somados.get(chave); if (existente) existente.quantidade += p.quantidade; else somados.set(chave, { ...p }); }
  return { postos: [...somados.values()], ...(metrosQuadrados && metrosQuadrados > 0 ? { metrosQuadrados } : {}), ...(ajustados.length ? { ajustados } : {}) };
}
export const PEDIDO_ORCAMENTO = /or[cç]amento|orcamento|cota[cç][aã]o|cotacao|quanto (?:custa|fica|sai|pago)|custo (?:de|para|mensal)|valor (?:de|para) (?:contratar|terceirizar)|preciso de|quero contratar|estimativa/i;

export function linkFerramenta(i: Interpretacao) {
  const postos = i.postos.map(p => `${p.funcaoId}:${p.quantidade}:${p.turno}`).join(',');
  return `/orcamento?postos=${encodeURIComponent(postos)}${i.metrosQuadrados ? `&m2=${i.metrosQuadrados}` : ''}`;
}
const brl = (v: number, en = false) => v.toLocaleString(en ? 'en-US' : 'pt-BR', { style: 'currency', currency: 'BRL' });
const nomeTurno = (t: string, en: boolean) => (t === 'noturno' ? (en ? 'night' : 'noturno') : (en ? 'day' : 'diurno'));

/**
 * Resposta do chat a um pedido de orçamento: cálculo determinístico com a tabela de referência e o link da ferramenta com os postos
 * preenchidos (onde se baixam os PDFs). Sem função reconhecida, apresenta a ferramenta.
 */
export function orcamentoAnswer(pergunta: string, language: string): string | undefined {
  if (/redij|escrev|reescrev|traduz|draft|write|translate/.test(norm(pergunta))) return undefined;
  if (!PEDIDO_ORCAMENTO.test(pergunta)) return undefined;
  const en = language === 'en'; const interpretado = interpretarPostos(pergunta);
  const explicito = /or[cç]amento|cota[cç][aã]o|estimativa|budget|quote/i.test(pergunta);
  if (!interpretado) {
    return explicito && /terceiriz|funcion[aá]rio|mao de obra|m[aã]o de obra|posto|auxiliar|limpeza|portaria|zelador/i.test(pergunta)
      ? (en ? 'I can estimate the monthly cost of outsourced staff. Tell me the positions, for example "3 cleaning assistants day and 3 night", or open the [budget tool](/orcamento) to choose positions and download the PDF.'
        : 'Posso estimar o custo mensal de mão de obra terceirizada. Diga os postos, por exemplo "3 auxiliares de limpeza diurno e 3 noturno", ou abra a [ferramenta de orçamento](/orcamento) para escolher os postos e baixar o PDF.') : undefined;
  }
  const r = calcularOrcamento({ postos: interpretado.postos as PostoEntrada[], metrosQuadrados: interpretado.metrosQuadrados });
  if (!r.postos.length) return undefined;
  const linhas = r.postos.map(p => `- ${p.quantidade}× ${p.funcao.nome} (${nomeTurno(p.entrada.turno, en)}): **${brl(p.valorMensal, en)}**/${en ? 'month' : 'mês'} (${brl(p.valorPorFuncionario, en)} ${en ? 'each' : 'por funcionário'})`);
  const area = r.precoPorMetro !== null ? ` · ${brl(r.precoPorMetro, en)}/m²` : '';
  return [
    en ? `Estimated monthly cost for ${r.funcionarios} employee(s): **${brl(r.valorContrato, en)}** (${brl(r.valorAnual, en)} in 12 months)${area}.` : `Estimativa mensal para ${r.funcionarios} funcionário(s): **${brl(r.valorContrato)}** (${brl(r.valorAnual)} em 12 meses)${area}.`,
    linhas.join('\n'),
    en ? `Includes salaries, ${(r.taxaEncargos * 100).toFixed(2)}% payroll charges, benefits, uniforms, PPE, taxes, overhead and margin, based on a reference price table.`
      : `Inclui salários, ${(r.taxaEncargos * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de encargos, benefícios, uniformes, EPIs, tributos, BDI e lucro, com base em tabela de referência de custos.`,
    en ? `[Open the budget tool to adjust positions and download the PDF quote and cost report](${linkFerramenta(interpretado)}).` : `[Abra a ferramenta para ajustar os postos e baixar o orçamento e o relatório de custo em PDF](${linkFerramenta(interpretado)}).`,
    ...(interpretado.ajustados?.length ? [en ? `Note: the reference table has no night shift for ${interpretado.ajustados.join(', ')}; I used the day shift.` : `Observação: a tabela de referência não prevê turno noturno para ${interpretado.ajustados.join(', ')}; considerei o turno diurno.`] : []),
    en ? 'This is an estimate, not a commercial proposal; confirm the applicable collective agreement.' : 'É uma estimativa, não uma proposta comercial; confirme a convenção coletiva aplicável à categoria.',
  ].join('\n\n');
}
