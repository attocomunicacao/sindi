import type { Resultado, TipoAdicional } from '@/lib/orcamento/calculo';

/** O que a tela e a rota POST /api/orcamento/calcular mostram de um orçamento: valores e composição, sem o detalhe linha a linha do PDF. */
export function resumoDoOrcamento(r: Resultado) {
  return {
    valorContrato: r.valorContrato, valorAnual: r.valorAnual, funcionarios: r.funcionarios, precoMedioFuncionario: r.precoMedioFuncionario, precoPorMetro: r.precoPorMetro, custoTotal: r.custoTotal,
    taxaEncargos: r.taxaEncargos, somaTaxas: r.tributos.somaTaxas,
    postos: r.postos.map(p => ({
      funcao: p.funcao.nome, funcaoId: p.funcao.id, turno: p.entrada.turno, quantidade: p.quantidade, valorPorFuncionario: p.valorPorFuncionario, valorMensal: p.valorMensal, salario: p.funcao.salario,
      adicional: p.adicional as TipoAdicional | null, adicionalDescartado: p.adicionalDescartado as TipoAdicional | null,
    })),
    insumos: r.insumos.map(i => ({ nome: i.nome, titulo: i.titulo, quantidade: i.quantidade, custoMensal: i.custoMensal })),
    ...(r.tributacao ? { tributacao: r.tributacao } : {}),
    composicao: { folha: r.folha.subtotal, encargos: r.encargosValor, beneficios: r.beneficios.subtotal, outros: r.outros.subtotal, materiais: r.materiais.subtotal, tributosMargem: r.valorContrato - r.custoTotal },
  };
}
export type ResumoOrcamento = ReturnType<typeof resumoDoOrcamento>;
