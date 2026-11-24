import tabela from '@/lib/orcamento/tabela.json';
import { CATEGORIAS_INSUMO, FUNCOES, funcaoPorId, itensDaCategoria, type Funcao } from '@/lib/orcamento/catalogo';
import { calcularEncargos, type Encargos } from '@/lib/orcamento/encargos';
import { planejarTributacao, type ResultadoTributacao, type TributacaoEntrada } from '@/lib/orcamento/tributacao';

export type Turno = 'diurno' | 'noturno';
export type PostoEntrada = {
  funcaoId: string;
  quantidade: number;
  turno: Turno;
  /** Periculosidade de 30% sobre o salário. `true` força; `false` remove, inclusive a da função "com periculosidade"; ausente segue a função. */
  periculosidade?: boolean;
  /** Grau da insalubridade sobre o salário mínimo. `0` remove a da função; ausente segue a função. */
  insalubridade?: 0 | 0.1 | 0.2 | 0.4;
  /** Horas noturnas por funcionário por mês; padrão de 180 no turno noturno, como no exemplo de portaria da planilha. */
  horasNoturnas?: number;
  horasExtras?: { h50?: number; h100?: number; h150?: number };
};
export type InsumoEntrada = { categoria: string; id: string; quantidade: number };
export type ImpostosInformados = {
  iss?: number;
  pis?: number;
  cofins?: number;
  contribuicaoSocial?: number;
  irpj?: number;
};
export type OrcamentoEntrada = {
  postos: PostoEntrada[];
  iss?: number;
  /** BDI e lucro (fração do preço, 0 a 0,5), informados por quem usa. Ausentes valem zero: a SINDI não sugere margem. */
  bdi?: number;
  lucro?: number;
  /** Tributos do preço (fração do faturamento, 0 a 0,5 cada), informados por quem usa; ausentes valem zero. Não afeta CBS/IBS nem o DAS, que são cálculo legal. */
  impostos?: ImpostosInformados;
  metrosQuadrados?: number;
  insumos?: InsumoEntrada[];
  /** Regime tributário do preço; ausente ou `atual` mantém as regras atuais (ISS, PIS, COFINS, CSLL, IRPJ), com o resultado de sempre. */
  tributacao?: TributacaoEntrada;
};

export const HORAS_NOTURNAS_PADRAO = 180;
export const ISS_PERMITIDO = [0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05];
/** Limites da entrada: valem na página, no cálculo e no servidor (o esquema da rota usa as mesmas constantes), para a tela nunca mostrar um preço que o PDF recusaria. */
/** Teto de cada fração informada (BDI, lucro, tributos): acima disso é quase certamente engano de digitação (50 em vez de 0,5%). */
export const LIMITE_DE_FRACAO = 0.5;
export const fracaoValida = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= LIMITE_DE_FRACAO;
export const LIMITE_DE_QUANTIDADE = 500;
export const LIMITE_DE_HORAS_NOTURNAS = 220;
export const LIMITE_DE_METROS_QUADRADOS = 10_000_000;

/** Primeira razão pela qual a entrada não pode ser calculada (mensagem para quem usa a tela), ou `undefined` se está válida. */
export function erroDaEntrada(entrada: OrcamentoEntrada): string | undefined {
  for (const p of entrada.postos) {
    if (!Number.isFinite(p.quantidade) || p.quantidade < 0 || p.quantidade > LIMITE_DE_QUANTIDADE)
      return `A quantidade de um posto vai de 1 a ${LIMITE_DE_QUANTIDADE} funcionários.`;
    if (p.horasNoturnas !== undefined && (!(p.horasNoturnas >= 0) || p.horasNoturnas > LIMITE_DE_HORAS_NOTURNAS))
      return `As horas noturnas por mês vão de 0 a ${LIMITE_DE_HORAS_NOTURNAS}.`;
  }
  if (entrada.iss !== undefined && !ISS_PERMITIDO.some((v) => Math.abs(v - entrada.iss!) < 1e-9))
    return 'O ISS deve ficar entre 2% e 5%.';
  for (const [nome, v] of [
    ['O BDI', entrada.bdi],
    ['O lucro', entrada.lucro],
    ...Object.entries(entrada.impostos ?? {}).map(([k, x]) => [`O tributo ${k}`, x] as const),
  ] as const)
    if (v !== undefined && !fracaoValida(v)) return `${nome} informado deve ficar entre 0% e 50%.`;
  if (somaInformada(entrada) >= 1) return 'BDI, lucro e tributos informados somam 100% ou mais do preço.';
  if (
    entrada.metrosQuadrados !== undefined &&
    !(entrada.metrosQuadrados >= 0 && entrada.metrosQuadrados <= LIMITE_DE_METROS_QUADRADOS)
  )
    return 'A área informada é inválida.';
  return undefined;
}

/** Soma das taxas que quem usa informou (a parte legal, DAS e CBS/IBS, vem do plano tributário). */
function somaInformada(e: OrcamentoEntrada) {
  const i = e.impostos ?? {};
  return soma(
    e.bdi ?? 0,
    e.lucro ?? 0,
    e.iss ?? i.iss ?? 0,
    i.pis ?? 0,
    i.cofins ?? 0,
    i.contribuicaoSocial ?? 0,
    i.irpj ?? 0,
  );
}

export type Parcelas = {
  salario: number;
  periculosidade: number;
  insalubridade: number;
  adicionalNoturno: number;
  horasExtras: number;
  folha: number;
  encargos: number;
  cestaBasica: number;
  valeRefeicao: number;
  assistenciaMedica: number;
  assistenciaSocial: number;
  seguroVida: number;
  valeTransporte: number;
  ppr: number;
  pcmso: number;
  seac: number;
  contribuicaoPatronal: number;
  uniformes: number;
  epis: number;
};
export type TipoAdicional = 'periculosidade' | 'insalubridade';
export type PostoCalculado = {
  /** Adicional que entrou na folha (o maior) e o que foi descartado por não se acumular (CLT art. 193 §2º). */
  adicional: TipoAdicional | null;
  adicionalDescartado: TipoAdicional | null;
  entrada: PostoEntrada;
  funcao: Funcao;
  quantidade: number;
  porFuncionario: Parcelas;
  total: Parcelas;
  custoDireto: number;
  custoPorFuncionario: number;
  valorMensal: number;
  valorPorFuncionario: number;
};
export type InsumoCalculado = {
  categoria: string;
  titulo: string;
  nome: string;
  quantidade: number;
  valorUnitario: number;
  custoMensal: number;
};
export type Resultado = {
  postos: PostoCalculado[];
  insumos: InsumoCalculado[];
  encargos: Encargos;
  taxaEncargos: number;
  encargosValor: number;
  funcionarios: number;
  folha: {
    salarios: number;
    horasExtras: number;
    adicionalNoturno: number;
    insalubridade: number;
    periculosidade: number;
    subtotal: number;
  };
  beneficios: {
    cestaBasica: number;
    valeRefeicao: number;
    assistenciaMedica: number;
    assistenciaSocial: number;
    seguroVida: number;
    valeTransporte: number;
    subtotal: number;
  };
  outros: { pcmsoPpr: number; seac: number; contribuicaoPatronal: number; subtotal: number };
  materiais: { uniformes: number; epis: number; insumos: number; subtotal: number };
  custoTotal: number;
  tributos: {
    bdi: number;
    lucro: number;
    iss: number;
    pis: number;
    cofins: number;
    contribuicaoSocial: number;
    irpj: number;
    taxas: Record<string, number>;
    somaTaxas: number;
    totalBdi: number;
    totalImpostos: number;
  };
  /** Com margem e tributos zerados é igual ao `custoTotal`: a SINDI mostra custo, nunca preço. */
  valorContrato: number;
  /** Verdadeiro quando há BDI, lucro ou tributos informados (ou o DAS do Simples) e o valor passa a ser "por dentro" deles. */
  margemInformada: boolean;
  valorAnual: number;
  precoMedioFuncionario: number;
  precoPorMetro: number | null;
  /** Presente só quando a tributação escolhida é a Reforma ou o Simples: memória de cálculo, nota e avisos. */
  tributacao?: ResultadoTributacao;
};

const soma = (...valores: number[]) => valores.reduce((a, b) => a + b, 0);
const zero = (): Parcelas => ({
  salario: 0,
  periculosidade: 0,
  insalubridade: 0,
  adicionalNoturno: 0,
  horasExtras: 0,
  folha: 0,
  encargos: 0,
  cestaBasica: 0,
  valeRefeicao: 0,
  assistenciaMedica: 0,
  assistenciaSocial: 0,
  seguroVida: 0,
  valeTransporte: 0,
  ppr: 0,
  pcmso: 0,
  seac: 0,
  contribuicaoPatronal: 0,
  uniformes: 0,
  epis: 0,
});
const multiplicar = (p: Parcelas, n: number): Parcelas =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v * n])) as Parcelas;
export const custoDiretoDe = (p: Parcelas) =>
  soma(
    p.folha,
    p.encargos,
    p.cestaBasica,
    p.valeRefeicao,
    p.assistenciaMedica,
    p.assistenciaSocial,
    p.seguroVida,
    p.valeTransporte,
    p.ppr,
    p.pcmso,
    p.seac,
    p.contribuicaoPatronal,
    p.uniformes,
    p.epis,
  );

function custoEpi(funcao: Funcao) {
  const kit = funcao.kit ? (tabela.kitsEpi as Record<string, { valor: number }[]>)[funcao.kit] : undefined;
  return kit ? soma(...kit.map((i) => i.valor)) : 0;
}
/**
 * Adicionais do posto. Periculosidade e insalubridade não se acumulam (CLT art. 193 §2º: o empregado opta por um): entra o maior, e em empate a periculosidade.
 * `base` é o salário mais o adicional aplicado, que é sobre o que incidem as horas extras e o adicional noturno.
 */
export function adicionaisDoPosto(posto: PostoEntrada, funcao: Funcao) {
  const percentual =
    posto.periculosidade === true
      ? Math.max(funcao.periculosidade, 0.3)
      : posto.periculosidade === false
        ? 0
        : funcao.periculosidade;
  const periculosidade = funcao.salario * percentual;
  const insalubridade = tabela.parametros.salarioMinimo * (posto.insalubridade ?? funcao.insalubridade);
  const aplicado: TipoAdicional | null =
    periculosidade <= 0 && insalubridade <= 0
      ? null
      : periculosidade >= insalubridade
        ? 'periculosidade'
        : 'insalubridade';
  const descartado: TipoAdicional | null =
    periculosidade > 0 && insalubridade > 0
      ? aplicado === 'periculosidade'
        ? 'insalubridade'
        : 'periculosidade'
      : null;
  const valores = {
    periculosidade: aplicado === 'periculosidade' ? periculosidade : 0,
    insalubridade: aplicado === 'insalubridade' ? insalubridade : 0,
  };
  return { ...valores, aplicado, descartado, base: funcao.salario + valores.periculosidade + valores.insalubridade };
}
/** Custo mensal de um funcionário no posto, seguindo as fórmulas da aba "Inserção de dados" e do "Resumo" da planilha (com o adicional único e a base das horas descritos acima). */
export function custoPorFuncionario(posto: PostoEntrada, funcao: Funcao, taxaEncargos: number): Parcelas {
  const p = tabela.parametros;
  const { periculosidade, insalubridade, base } = adicionaisDoPosto(posto, funcao);
  const hora = base / funcao.divisorHoras;
  const dsr = p.dsr.diasDescanso / p.dsr.diasUteis;
  const horasNoturnas = posto.turno === 'noturno' ? (posto.horasNoturnas ?? HORAS_NOTURNAS_PADRAO) : 0;
  const adicionalNoturno = hora * p.adicionalNoturno * horasNoturnas * (1 + dsr);
  const he = posto.horasExtras ?? {};
  const valorHe = hora * (1.5 * (he.h50 ?? 0) + 2 * (he.h100 ?? 0) + 2.5 * (he.h150 ?? 0));
  const horasExtras = valorHe * (1 + dsr);
  const folha = funcao.salario + periculosidade + insalubridade + adicionalNoturno + horasExtras;
  const valeTransporte = Math.max(
    0,
    p.valeTransporteUnitario * p.viagensPorDia * p.diasValeTransporte - funcao.salario * p.descontoValeTransporte,
  );
  return {
    salario: funcao.salario,
    periculosidade,
    insalubridade,
    adicionalNoturno,
    horasExtras,
    folha,
    encargos: folha * taxaEncargos,
    cestaBasica: p.cestaBasica,
    valeRefeicao: p.valeRefeicaoDia * p.diasValeRefeicao,
    assistenciaMedica: p.assistenciaMedica,
    assistenciaSocial: p.assistenciaSocialFamiliar,
    seguroVida: p.seguroVida,
    valeTransporte,
    ppr: p.ppr,
    pcmso: p.pcmso,
    seac: funcao.salario * p.seac,
    contribuicaoPatronal: funcao.salario * p.contribuicaoAssistencialPatronal,
    uniformes: funcao.uniformeMensal,
    epis: custoEpi(funcao),
  };
}
/** Insumos: consumo = quantidade × valor; equipamento = (quantidade × valor ÷ meses de depreciação) + manutenção anual ÷ 12, como na planilha. */
export function calcularInsumos(entrada: InsumoEntrada[] = []): InsumoCalculado[] {
  const resultado: InsumoCalculado[] = [];
  for (const e of entrada) {
    const categoria = CATEGORIAS_INSUMO.find((c) => c.id === e.categoria);
    if (!categoria || !(e.quantidade > 0)) continue;
    const item = itensDaCategoria(categoria.id).find((i) => i.id === e.id);
    if (!item) continue;
    const custoMensal =
      categoria.tipo === 'consumo'
        ? e.quantidade * item.valor
        : (e.quantidade * item.valor) / (item.depreciacaoMeses || 1) +
          (e.quantidade * item.valor * (item.manutencaoAno ?? 0)) / 12;
    resultado.push({
      categoria: categoria.id,
      titulo: categoria.titulo,
      nome: item.nome,
      quantidade: e.quantidade,
      valorUnitario: item.valor,
      custoMensal,
    });
  }
  return resultado;
}

export function calcularOrcamento(entrada: OrcamentoEntrada): Resultado {
  const recusa = erroDaEntrada(entrada);
  if (recusa) throw new RangeError(recusa);
  // Nada vem da tabela: BDI, lucro e tributos do preço só valem se quem usa informou (parecer jurídico: custo, não preço).
  const imp = entrada.impostos ?? {};
  const iss = entrada.iss ?? imp.iss ?? 0;
  const plano = planejarTributacao(entrada.tributacao, {
    iss,
    pis: imp.pis ?? 0,
    cofins: imp.cofins ?? 0,
    contribuicaoSocial: imp.contribuicaoSocial ?? 0,
    irpj: imp.irpj ?? 0,
  });
  // No Simples, as contribuições que o DAS substitui saem dos encargos (ver tributacao.ts).
  const encargos = calcularEncargos(undefined, { excluirLinhas: plano.excluirEncargos });
  const taxaEncargos = encargos.total;
  const postos: PostoCalculado[] = [];
  const agrupados: Parcelas[] = [];
  for (const e of entrada.postos) {
    const funcao = funcaoPorId(e.funcaoId);
    if (!funcao || !(e.quantidade > 0)) continue;
    const porFuncionario = custoPorFuncionario(e, funcao, taxaEncargos);
    const total = multiplicar(porFuncionario, e.quantidade);
    const { aplicado, descartado } = adicionaisDoPosto(e, funcao);
    postos.push({
      adicional: aplicado,
      adicionalDescartado: descartado,
      entrada: e,
      funcao,
      quantidade: e.quantidade,
      porFuncionario,
      total,
      custoDireto: custoDiretoDe(total),
      custoPorFuncionario: custoDiretoDe(porFuncionario),
      valorMensal: 0,
      valorPorFuncionario: 0,
    });
    agrupados.push(total);
  }
  const insumos = calcularInsumos(entrada.insumos);
  const t = agrupados.reduce((acc, p) => {
    for (const k of Object.keys(acc) as (keyof Parcelas)[]) acc[k] += p[k];
    return acc;
  }, zero());
  const totalInsumos = soma(...insumos.map((i) => i.custoMensal));
  const funcionarios = soma(...postos.map((p) => p.quantidade));
  const folha = {
    salarios: t.salario,
    horasExtras: t.horasExtras,
    adicionalNoturno: t.adicionalNoturno,
    insalubridade: t.insalubridade,
    periculosidade: t.periculosidade,
    subtotal: t.folha,
  };
  const beneficios = {
    cestaBasica: t.cestaBasica,
    valeRefeicao: t.valeRefeicao,
    assistenciaMedica: t.assistenciaMedica,
    assistenciaSocial: t.assistenciaSocial,
    seguroVida: t.seguroVida,
    valeTransporte: t.valeTransporte,
    subtotal: soma(
      t.cestaBasica,
      t.valeRefeicao,
      t.assistenciaMedica,
      t.assistenciaSocial,
      t.seguroVida,
      t.valeTransporte,
    ),
  };
  const outros = {
    pcmsoPpr: t.pcmso + t.ppr,
    seac: t.seac,
    contribuicaoPatronal: t.contribuicaoPatronal,
    subtotal: soma(t.pcmso, t.ppr, t.seac, t.contribuicaoPatronal),
  };
  const materiais = {
    uniformes: t.uniformes,
    epis: t.epis,
    insumos: totalInsumos,
    subtotal: soma(t.uniformes, t.epis, totalInsumos),
  };
  const custoTotal = folha.subtotal + t.encargos + beneficios.subtotal + outros.subtotal + materiais.subtotal;
  const taxas: Record<string, number> = { BDI: entrada.bdi ?? 0, Lucro: entrada.lucro ?? 0, ...plano.taxas };
  const somaTaxas = soma(...Object.values(taxas));
  // O DAS do Simples pode somar às taxas informadas: a conta só fecha se o total ficar abaixo de 100%.
  if (somaTaxas >= 1) throw new RangeError('BDI, lucro e tributos somam 100% ou mais do preço.');
  // O preço é o custo "por dentro": tributos e margem incidem sobre o valor faturado (custo ÷ (1 − soma das taxas)), como no Resumo da planilha.
  // Sem taxas, a divisão é por 1 e o valor é o próprio custo.
  const valorContrato = custoTotal > 0 ? custoTotal / (1 - somaTaxas) : 0;
  const valor = (taxa: number) => valorContrato * taxa;
  const c = plano.componentes;
  const tributos = {
    bdi: valor(taxas.BDI),
    lucro: valor(taxas.Lucro),
    iss: valor(c.iss),
    pis: valor(c.pis),
    cofins: valor(c.cofins),
    contribuicaoSocial: valor(c.contribuicaoSocial),
    irpj: valor(c.irpj),
    taxas,
    somaTaxas,
    totalBdi: valor(taxas.BDI + taxas.Lucro),
    totalImpostos: valor(soma(...Object.values(plano.taxas))),
  };
  // O custo dos insumos é rateado entre os postos pelo custo direto de cada um.
  const custoPostos = soma(...postos.map((p) => p.custoDireto));
  for (const p of postos) {
    const participacao = custoPostos > 0 ? p.custoDireto / custoPostos : 0;
    p.valorMensal = (p.custoDireto + totalInsumos * participacao) / (1 - somaTaxas);
    p.valorPorFuncionario = p.valorMensal / p.quantidade;
  }
  const metros = entrada.metrosQuadrados && entrada.metrosQuadrados > 0 ? entrada.metrosQuadrados : null;
  const tributacao =
    entrada.tributacao && entrada.tributacao.modo !== 'atual' && valorContrato > 0
      ? plano.finalizar(valorContrato, { issMunicipal: iss })
      : undefined;
  return {
    postos,
    insumos,
    encargos,
    taxaEncargos,
    encargosValor: t.encargos,
    funcionarios,
    folha,
    beneficios,
    outros,
    materiais,
    custoTotal,
    tributos,
    valorContrato,
    margemInformada: somaTaxas > 0,
    valorAnual: valorContrato * 12,
    precoMedioFuncionario: funcionarios > 0 ? valorContrato / funcionarios : 0,
    precoPorMetro: metros ? valorContrato / metros : null,
    ...(tributacao ? { tributacao } : {}),
  };
}
export { FUNCOES };
