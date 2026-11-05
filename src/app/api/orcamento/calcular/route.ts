import { calcularOrcamento } from '@/lib/orcamento/calculo';
import { lerRequisicao } from '@/lib/orcamento/requisicao';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const lida = await lerRequisicao(request);
  if ('resposta' in lida) return lida.resposta;
  const r = calcularOrcamento(lida.corpo);
  if (!r.postos.length) return Response.json({ error: 'Nenhum posto válido.' }, { status: 400 });
  return Response.json({
    valorContrato: r.valorContrato, valorAnual: r.valorAnual, funcionarios: r.funcionarios, precoMedioFuncionario: r.precoMedioFuncionario, precoPorMetro: r.precoPorMetro, custoTotal: r.custoTotal,
    taxaEncargos: r.taxaEncargos, somaTaxas: r.tributos.somaTaxas,
    postos: r.postos.map(p => ({ funcao: p.funcao.nome, funcaoId: p.funcao.id, turno: p.entrada.turno, quantidade: p.quantidade, valorPorFuncionario: p.valorPorFuncionario, valorMensal: p.valorMensal, salario: p.funcao.salario })),
    insumos: r.insumos.map(i => ({ nome: i.nome, titulo: i.titulo, quantidade: i.quantidade, custoMensal: i.custoMensal })),
    composicao: { folha: r.folha.subtotal, encargos: r.encargosValor, beneficios: r.beneficios.subtotal, outros: r.outros.subtotal, materiais: r.materiais.subtotal, tributosMargem: r.valorContrato - r.custoTotal },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
