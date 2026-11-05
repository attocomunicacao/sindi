import tabela from '@/lib/orcamento/tabela.json';
import { CATEGORIAS_INSUMO, FUNCOES, FUNCOES_SOB_CONSULTA, itensDaCategoria } from '@/lib/orcamento/catalogo';
import { HORAS_NOTURNAS_PADRAO, ISS_PERMITIDO } from '@/lib/orcamento/calculo';
import { calcularEncargos } from '@/lib/orcamento/encargos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Funções, insumos e parâmetros que a tela precisa para montar o formulário; preços de função e insumo vêm da tabela de referência. */
export async function GET() {
  return Response.json({
    funcoes: FUNCOES.map(f => ({ id: f.id, nome: f.nome, salario: f.salario, permiteNoturno: f.permiteNoturno, periculosidade: f.periculosidade, insalubridade: f.insalubridade })),
    sobConsulta: FUNCOES_SOB_CONSULTA,
    categorias: CATEGORIAS_INSUMO.map(c => ({ id: c.id, titulo: c.titulo, tipo: c.tipo, itens: itensDaCategoria(c.id).map(i => ({ id: i.id, nome: i.nome, valor: i.valor })) })),
    iss: ISS_PERMITIDO, issPadrao: tabela.parametros.impostos.iss, horasNoturnasPadrao: HORAS_NOTURNAS_PADRAO,
    encargos: calcularEncargos().total, referencia: { origem: 'tabela de referência de custos de terceirização', extraidoEm: tabela.meta.extraidoEm, observacao: tabela.meta.observacao },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
