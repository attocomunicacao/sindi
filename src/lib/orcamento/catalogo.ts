import tabela from './tabela.json';

export type Funcao = {
  id: string; nome: string; salario: number; divisorHoras: number; periculosidade: number; insalubridade: number;
  /** A função pode ser orçada no turno noturno (adicional noturno de 20% mais DSR). */
  permiteNoturno: boolean; uniformeMensal: number; kit: string | null; sinonimos: string[];
};
export type ItemInsumo = { id: string; nome: string; valor: number; depreciacaoMeses?: number; manutencaoAno?: number };
export type CategoriaInsumo = { id: keyof typeof tabela.catalogo; titulo: string; tipo: 'consumo' | 'equipamento' };

/** Nome exibido, sinônimos para o chat e kit de EPI de cada função (as funções do kit estão em tabela.kitsEpi). */
const APRESENTACAO: Record<string, { id?: string; nome: string; kit?: string; sinonimos: string[]; noturno?: boolean; uniforme?: { quantidade: number } }> = {
  'auxiliar-de-limpeza-diurno': { id: 'auxiliar-de-limpeza', nome: 'Auxiliar de limpeza', kit: 'Aux de Limpeza', sinonimos: ['auxiliar de limpeza', 'auxiliares de limpeza', 'auxiliar de servicos de limpeza', 'faxineiro', 'faxineira', 'limpeza'], noturno: true },
  'auxiliar-de-limpeza-com-periculosidade': { id: 'auxiliar-de-limpeza-periculosidade', nome: 'Auxiliar de limpeza (com periculosidade)', kit: 'Aux de Limpeza', sinonimos: ['auxiliar de limpeza com periculosidade'], noturno: true, uniforme: { quantidade: 12 } },
  'operador-de-maquina': { nome: 'Operador de máquina', kit: 'Aux de Limpeza', sinonimos: ['operador de maquina', 'operadores de maquina'], noturno: true, uniforme: { quantidade: 1 } },
  'portaria': { id: 'porteiro', nome: 'Porteiro (portaria)', sinonimos: ['porteiro', 'porteiros', 'portaria'], noturno: true },
  'controlador-de-acesso': { nome: 'Controlador de acesso', sinonimos: ['controlador de acesso', 'controladores de acesso'], noturno: true },
  'encarregado-de-limpeza': { nome: 'Encarregado de limpeza', kit: 'Encarregado de Limpeza', sinonimos: ['encarregado de limpeza', 'encarregados de limpeza', 'encarregado'], noturno: true },
  'manutencao': { nome: 'Auxiliar de manutenção', kit: 'Oficial de Manutenção', sinonimos: ['auxiliar de manutencao', 'manutencao', 'manutencionista'] },
  'jardineiro': { nome: 'Jardineiro', kit: 'Jardineiro', sinonimos: ['jardineiro', 'jardineiros'] },
  'recepcionista-masculino': { id: 'recepcionista', nome: 'Recepcionista', sinonimos: ['recepcionista', 'recepcionistas', 'recepcao'], noturno: true },
  'auxiliar-de-servicos-gerais': { nome: 'Auxiliar de serviços gerais', sinonimos: ['auxiliar de servicos gerais', 'auxiliares de servicos gerais', 'servicos gerais', 'asg'], noturno: true },
  'auxiliar-de-departamento-pessoal': { nome: 'Auxiliar de departamento pessoal', sinonimos: ['auxiliar de departamento pessoal', 'auxiliar de dp'] },
  'zelador': { nome: 'Zelador', sinonimos: ['zelador', 'zeladores', 'zeladoria'], noturno: true },
  'lider': { nome: 'Líder', sinonimos: ['lider', 'lideres', 'lider de equipe'] },
  'banheirista-diurno': { id: 'banheirista', nome: 'Banheirista', kit: 'Banheirista', sinonimos: ['banheirista', 'banheiristas'], noturno: true },
};
/** Linhas da planilha que viram a mesma função com outro turno (o turno é uma opção do posto, não outra função). */
const IGNORADAS = new Set(['banheirista-noturno', 'recepcionista-feminino']);

/** Funções que a tabela permite orçar: as que têm salário definido. As demais aparecem como "sob consulta". */
export const FUNCOES: Funcao[] = tabela.funcoes.flatMap(f => {
  if (!f.salario || IGNORADAS.has(f.id)) return [];
  const a = APRESENTACAO[f.id];
  const quantidade = a?.uniforme?.quantidade ?? f.uniforme.quantidade ?? 0;
  const uniformeMensal = ((f.uniforme.unitario ?? 0) * quantidade) / (f.uniforme.meses || 12);
  return [{
    id: a?.id ?? f.id, nome: a?.nome ?? f.nome, salario: f.salario, divisorHoras: f.divisorHoras, periculosidade: f.periculosidade, insalubridade: f.insalubridade,
    permiteNoturno: a?.noturno ?? false, uniformeMensal, kit: a?.kit ?? null, sinonimos: a?.sinonimos ?? [f.nome.toLowerCase()],
  }];
});
export const funcaoPorId = (id: string) => FUNCOES.find(f => f.id === id);
export const FUNCOES_SOB_CONSULTA = tabela.funcoes.filter(f => !f.salario).map(f => f.nome);

/** Ajustes aplicados aos dados brutos da planilha, mostrados no relatório de custo para transparência. */
export const AJUSTES_TABELA = [
  'Auxiliar de limpeza com periculosidade usa o mesmo kit de uniforme do auxiliar de limpeza (na planilha a quantidade estava zerada).',
  'Operador de máquina recebe uma peça de uniforme por ano (na planilha a quantidade estava zerada).',
  'Kits de EPI são cobrados apenas para as funções incluídas no orçamento (a planilha somava R$ 17,00 de protetores auriculares sem funcionário correspondente).',
  'Horas extras: o repouso semanal remunerado incide sobre o valor das horas extras com a razão 8/22 da planilha (a fórmula original reaproveitava a do adicional noturno).',
];

export const CATEGORIAS_INSUMO: CategoriaInsumo[] = [
  { id: 'quimicos', titulo: 'Produtos químicos de limpeza', tipo: 'consumo' }, { id: 'materiaisDiversos', titulo: 'Materiais e acessórios de limpeza', tipo: 'consumo' },
  { id: 'equipamentosLimpeza', titulo: 'Equipamentos de limpeza', tipo: 'equipamento' }, { id: 'jardinagemMateriais', titulo: 'Jardinagem — materiais', tipo: 'consumo' },
  { id: 'jardinagemEquipamentos', titulo: 'Jardinagem — equipamentos', tipo: 'equipamento' }, { id: 'manutencaoEquipamentos', titulo: 'Manutenção predial — equipamentos', tipo: 'equipamento' },
  { id: 'informaticaComunicacao', titulo: 'Informática, comunicação e portaria', tipo: 'equipamento' }, { id: 'servicosContratados', titulo: 'Serviços contratados', tipo: 'consumo' },
];
export function itensDaCategoria(id: CategoriaInsumo['id']): ItemInsumo[] {
  return (tabela.catalogo[id] as ItemInsumo[]).filter(i => i.valor > 0);
}
