import tabela from './tabela.json';
import { CATEGORIAS_INSUMO, FUNCOES, funcaoPorId, itensDaCategoria, type Funcao } from './catalogo';
import { calcularEncargos, type Encargos } from './encargos';

export type Turno = 'diurno' | 'noturno';
export type PostoEntrada = {
  funcaoId: string; quantidade: number; turno: Turno;
  /** Periculosidade de 30% sobre o salário (a função "com periculosidade" já a inclui). */
  periculosidade?: boolean; insalubridade?: 0 | 0.1 | 0.2 | 0.4;
  /** Horas noturnas por funcionário por mês; padrão de 180 no turno noturno, como no exemplo de portaria da planilha. */
  horasNoturnas?: number; horasExtras?: { h50?: number; h100?: number; h150?: number };
};
export type InsumoEntrada = { categoria: string; id: string; quantidade: number };
export type OrcamentoEntrada = { postos: PostoEntrada[]; iss?: number; metrosQuadrados?: number; insumos?: InsumoEntrada[] };

export const HORAS_NOTURNAS_PADRAO = 180;
export const ISS_PERMITIDO = [0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05];

export type Parcelas = {
  salario: number; periculosidade: number; insalubridade: number; adicionalNoturno: number; horasExtras: number; folha: number; encargos: number;
  cestaBasica: number; valeRefeicao: number; assistenciaMedica: number; assistenciaSocial: number; seguroVida: number; valeTransporte: number;
  ppr: number; pcmso: number; seac: number; contribuicaoPatronal: number; uniformes: number; epis: number;
};
export type PostoCalculado = {
  entrada: PostoEntrada; funcao: Funcao; quantidade: number; porFuncionario: Parcelas; total: Parcelas; custoDireto: number; custoPorFuncionario: number;
  valorMensal: number; valorPorFuncionario: number;
};
export type InsumoCalculado = { categoria: string; titulo: string; nome: string; quantidade: number; valorUnitario: number; custoMensal: number };
export type Resultado = {
  postos: PostoCalculado[]; insumos: InsumoCalculado[]; encargos: Encargos; taxaEncargos: number; encargosValor: number; funcionarios: number;
  folha: { salarios: number; horasExtras: number; adicionalNoturno: number; insalubridade: number; periculosidade: number; subtotal: number };
  beneficios: { cestaBasica: number; valeRefeicao: number; assistenciaMedica: number; assistenciaSocial: number; seguroVida: number; valeTransporte: number; subtotal: number };
  outros: { pcmsoPpr: number; seac: number; contribuicaoPatronal: number; subtotal: number };
  materiais: { uniformes: number; epis: number; insumos: number; subtotal: number };
  custoTotal: number;
  tributos: { bdi: number; lucro: number; iss: number; pis: number; cofins: number; contribuicaoSocial: number; irpj: number; taxas: Record<string, number>; somaTaxas: number; totalBdi: number; totalImpostos: number };
  valorContrato: number; valorAnual: number; precoMedioFuncionario: number; precoPorMetro: number | null;
};

const soma = (...valores: number[]) => valores.reduce((a, b) => a + b, 0);
const zero = (): Parcelas => ({ salario: 0, periculosidade: 0, insalubridade: 0, adicionalNoturno: 0, horasExtras: 0, folha: 0, encargos: 0, cestaBasica: 0, valeRefeicao: 0, assistenciaMedica: 0, assistenciaSocial: 0, seguroVida: 0, valeTransporte: 0, ppr: 0, pcmso: 0, seac: 0, contribuicaoPatronal: 0, uniformes: 0, epis: 0 });
const multiplicar = (p: Parcelas, n: number): Parcelas => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v * n])) as Parcelas;
export const custoDiretoDe = (p: Parcelas) => soma(p.folha, p.encargos, p.cestaBasica, p.valeRefeicao, p.assistenciaMedica, p.assistenciaSocial, p.seguroVida, p.valeTransporte, p.ppr, p.pcmso, p.seac, p.contribuicaoPatronal, p.uniformes, p.epis);

function custoEpi(funcao: Funcao) {
  const kit = funcao.kit ? (tabela.kitsEpi as Record<string, { valor: number }[]>)[funcao.kit] : undefined;
  return kit ? soma(...kit.map(i => i.valor)) : 0;
}
/** Custo mensal de um funcionário no posto, seguindo as fórmulas da aba "Inserção de dados" e do "Resumo" da planilha. */
export function custoPorFuncionario(posto: PostoEntrada, funcao: Funcao, taxaEncargos: number): Parcelas {
  const p = tabela.parametros;
  const hora = funcao.salario / funcao.divisorHoras;
  const periculosidade = funcao.salario * (posto.periculosidade ? Math.max(funcao.periculosidade, 0.3) : funcao.periculosidade);
  const grauInsalubridade = posto.insalubridade ?? funcao.insalubridade;
  const insalubridade = p.salarioMinimo * grauInsalubridade;
  const dsr = p.dsr.diasDescanso / p.dsr.diasUteis;
  const horasNoturnas = posto.turno === 'noturno' ? (posto.horasNoturnas ?? HORAS_NOTURNAS_PADRAO) : 0;
  const adicionalNoturno = hora * p.adicionalNoturno * horasNoturnas * (1 + dsr);
  const he = posto.horasExtras ?? {};
  const valorHe = ((funcao.salario / 220) * 1.5 * (he.h50 ?? 0)) + ((funcao.salario / 220) * 2 * (he.h100 ?? 0)) + ((funcao.salario / 220) * 2.5 * (he.h150 ?? 0));
  const horasExtras = valorHe * (1 + dsr);
  const folha = funcao.salario + periculosidade + insalubridade + adicionalNoturno + horasExtras;
  const valeTransporte = Math.max(0, p.valeTransporteUnitario * p.viagensPorDia * p.diasValeTransporte - funcao.salario * p.descontoValeTransporte);
  return {
    salario: funcao.salario, periculosidade, insalubridade, adicionalNoturno, horasExtras, folha, encargos: folha * taxaEncargos,
    cestaBasica: p.cestaBasica, valeRefeicao: p.valeRefeicaoDia * p.diasValeRefeicao, assistenciaMedica: p.assistenciaMedica, assistenciaSocial: p.assistenciaSocialFamiliar,
    seguroVida: p.seguroVida, valeTransporte, ppr: p.ppr, pcmso: p.pcmso, seac: funcao.salario * p.seac, contribuicaoPatronal: funcao.salario * p.contribuicaoAssistencialPatronal,
    uniformes: funcao.uniformeMensal, epis: custoEpi(funcao),
  };
}
/** Insumos: consumo = quantidade × valor; equipamento = (quantidade × valor ÷ meses de depreciação) + manutenção anual ÷ 12, como na planilha. */
export function calcularInsumos(entrada: InsumoEntrada[] = []): InsumoCalculado[] {
  const resultado: InsumoCalculado[] = [];
  for (const e of entrada) {
    const categoria = CATEGORIAS_INSUMO.find(c => c.id === e.categoria); if (!categoria || !(e.quantidade > 0)) continue;
    const item = itensDaCategoria(categoria.id).find(i => i.id === e.id); if (!item) continue;
    const custoMensal = categoria.tipo === 'consumo' ? e.quantidade * item.valor
      : (e.quantidade * item.valor) / (item.depreciacaoMeses || 1) + (e.quantidade * item.valor * (item.manutencaoAno ?? 0)) / 12;
    resultado.push({ categoria: categoria.id, titulo: categoria.titulo, nome: item.nome, quantidade: e.quantidade, valorUnitario: item.valor, custoMensal });
  }
  return resultado;
}

export function calcularOrcamento(entrada: OrcamentoEntrada): Resultado {
  const encargos = calcularEncargos(); const taxaEncargos = encargos.total;
  const postos: PostoCalculado[] = []; const agrupados: Parcelas[] = [];
  for (const e of entrada.postos) {
    const funcao = funcaoPorId(e.funcaoId); if (!funcao || !(e.quantidade > 0)) continue;
    const porFuncionario = custoPorFuncionario(e, funcao, taxaEncargos); const total = multiplicar(porFuncionario, e.quantidade);
    postos.push({ entrada: e, funcao, quantidade: e.quantidade, porFuncionario, total, custoDireto: custoDiretoDe(total), custoPorFuncionario: custoDiretoDe(porFuncionario), valorMensal: 0, valorPorFuncionario: 0 });
    agrupados.push(total);
  }
  const insumos = calcularInsumos(entrada.insumos);
  const t = agrupados.reduce((acc, p) => { for (const k of Object.keys(acc) as (keyof Parcelas)[]) acc[k] += p[k]; return acc; }, zero());
  const totalInsumos = soma(...insumos.map(i => i.custoMensal));
  const funcionarios = soma(...postos.map(p => p.quantidade));
  const folha = { salarios: t.salario, horasExtras: t.horasExtras, adicionalNoturno: t.adicionalNoturno, insalubridade: t.insalubridade, periculosidade: t.periculosidade, subtotal: t.folha };
  const beneficios = { cestaBasica: t.cestaBasica, valeRefeicao: t.valeRefeicao, assistenciaMedica: t.assistenciaMedica, assistenciaSocial: t.assistenciaSocial, seguroVida: t.seguroVida, valeTransporte: t.valeTransporte,
    subtotal: soma(t.cestaBasica, t.valeRefeicao, t.assistenciaMedica, t.assistenciaSocial, t.seguroVida, t.valeTransporte) };
  const outros = { pcmsoPpr: t.pcmso + t.ppr, seac: t.seac, contribuicaoPatronal: t.contribuicaoPatronal, subtotal: soma(t.pcmso, t.ppr, t.seac, t.contribuicaoPatronal) };
  const materiais = { uniformes: t.uniformes, epis: t.epis, insumos: totalInsumos, subtotal: soma(t.uniformes, t.epis, totalInsumos) };
  const custoTotal = folha.subtotal + t.encargos + beneficios.subtotal + outros.subtotal + materiais.subtotal;
  const imp = tabela.parametros.impostos; const iss = entrada.iss ?? imp.iss;
  const taxas = { BDI: tabela.parametros.bdi, Lucro: tabela.parametros.lucro, ISS: iss, PIS: imp.pis, COFINS: imp.cofins, 'Contribuição social': imp.contribuicaoSocial, IRPJ: imp.irpj };
  const somaTaxas = soma(...Object.values(taxas));
  // O preço é o custo "por dentro": tributos e margem incidem sobre o valor faturado (custo ÷ (1 − soma das taxas)), como no Resumo da planilha.
  const valorContrato = custoTotal > 0 ? custoTotal / (1 - somaTaxas) : 0;
  const valor = (taxa: number) => valorContrato * taxa;
  const tributos = { bdi: valor(taxas.BDI), lucro: valor(taxas.Lucro), iss: valor(iss), pis: valor(imp.pis), cofins: valor(imp.cofins), contribuicaoSocial: valor(imp.contribuicaoSocial), irpj: valor(imp.irpj), taxas, somaTaxas,
    totalBdi: valor(taxas.BDI + taxas.Lucro), totalImpostos: valor(iss + imp.pis + imp.cofins + imp.contribuicaoSocial + imp.irpj) };
  // O custo dos insumos é rateado entre os postos pelo custo direto de cada um.
  const custoPostos = soma(...postos.map(p => p.custoDireto));
  for (const p of postos) {
    const participacao = custoPostos > 0 ? p.custoDireto / custoPostos : 0;
    p.valorMensal = (p.custoDireto + totalInsumos * participacao) / (1 - somaTaxas);
    p.valorPorFuncionario = p.valorMensal / p.quantidade;
  }
  const metros = entrada.metrosQuadrados && entrada.metrosQuadrados > 0 ? entrada.metrosQuadrados : null;
  return { postos, insumos, encargos, taxaEncargos, encargosValor: t.encargos, funcionarios, folha, beneficios, outros, materiais, custoTotal, tributos, valorContrato, valorAnual: valorContrato * 12,
    precoMedioFuncionario: funcionarios > 0 ? valorContrato / funcionarios : 0, precoPorMetro: metros ? valorContrato / metros : null };
}
export { FUNCOES };
