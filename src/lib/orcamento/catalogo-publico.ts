import tabela from './tabela.json';
import { CATEGORIAS_INSUMO, FUNCOES, FUNCOES_SOB_CONSULTA, itensDaCategoria } from './catalogo';
import { HORAS_NOTURNAS_PADRAO, ISS_PERMITIDO } from './calculo';
import { calcularEncargos } from './encargos';

/**
 * Funções, insumos e parâmetros que a tela do orçamento precisa para montar o formulário. Uma só fonte: a página calcula com ela no navegador
 * e a rota GET /api/orcamento/catalogo a devolve a quem consome a API. Preços de função e insumo vêm da tabela de referência.
 */
export function catalogoPublico() {
  return {
    funcoes: FUNCOES.map(f => ({ id: f.id, nome: f.nome, salario: f.salario, permiteNoturno: f.permiteNoturno, periculosidade: f.periculosidade, insalubridade: f.insalubridade })),
    sobConsulta: FUNCOES_SOB_CONSULTA,
    categorias: CATEGORIAS_INSUMO.map(c => ({ id: c.id as string, titulo: c.titulo, tipo: c.tipo, itens: itensDaCategoria(c.id).map(i => ({ id: i.id, nome: i.nome, valor: i.valor })) })),
    iss: ISS_PERMITIDO, issPadrao: tabela.parametros.impostos.iss, horasNoturnasPadrao: HORAS_NOTURNAS_PADRAO, salarioMinimo: tabela.parametros.salarioMinimo,
    encargos: calcularEncargos().total, referencia: { origem: 'tabela de referência de custos de terceirização', extraidoEm: tabela.meta.extraidoEm, observacao: tabela.meta.observacao },
  };
}
export type CatalogoPublico = ReturnType<typeof catalogoPublico>;
