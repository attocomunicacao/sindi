/**
 * Catálogo dos serviços do setor de terceirização para o cálculo de CBS/IBS.
 * Fonte: banco da Calculadora RTC da Receita Federal (MIT), flyway V0020 e V0061 (LC 116 ↔ NBS ↔ indOp) e a classificação
 * tributária (CST 000 / cClassTrib 000001 = tributação integral, sem redução). Local de incidência do IBS: endereço do
 * tomador para cessão de mão de obra e vigilância; local do imóvel para limpeza (LC 214/2025).
 * CONFERIR com o leiaute vigente (NT da Receita) antes de uso comercial: códigos NBS e cClassTrib podem ser revistos.
 */
export type LocalIncidencia = 'tomador' | 'imovel';
export type ServicoTributavel = {
  id: string;
  lc116: string;
  descricao: string;
  nbs: string[];
  cst: string;
  cClassTrib: string;
  /** Redução da alíquota (pontos percentuais da alíquota padrão; 0 = integral). */
  reducaoPct: number;
  local: LocalIncidencia;
  observacao?: string;
};

const INTEGRAL = { cst: '000', cClassTrib: '000001', reducaoPct: 0 } as const;

export const SERVICOS: readonly ServicoTributavel[] = [
  {
    id: 'mao-de-obra',
    lc116: '17.05',
    descricao: 'Fornecimento de mão de obra (cessão/locação, inclusive temporária)',
    nbs: ['118012100', '118012200'],
    local: 'tomador',
    ...INTEGRAL,
    observacao: 'NBS 118012100 (exceto temporária) e 118012200 (temporária).',
  },
  {
    id: 'vigilancia',
    lc116: '11.02',
    descricao: 'Vigilância, segurança e monitoramento',
    nbs: ['118025000', '118022000', '118023000', '118029000'],
    local: 'tomador',
    ...INTEGRAL,
  },
  {
    id: 'limpeza',
    lc116: '7.10',
    descricao: 'Limpeza, manutenção e conservação de imóveis',
    nbs: ['118031000', '118032200', '118032900'],
    local: 'imovel',
    ...INTEGRAL,
    observacao: 'O IBS é devido ao município onde está o imóvel.',
  },
  {
    id: 'profissoes-intelectuais',
    lc116: '17.xx',
    descricao: 'Serviço de profissão intelectual regulamentada (exemplo de redução de 30%)',
    nbs: [],
    local: 'tomador',
    cst: '200',
    cClassTrib: '200052',
    reducaoPct: 30,
    observacao: 'Exemplo da tabela da Receita; não é serviço típico do setor. Confira a classificação do seu serviço.',
  },
];

export const servicoPorId = (id: string): ServicoTributavel | undefined => SERVICOS.find((s) => s.id === id);
export const SERVICO_PADRAO = 'mao-de-obra';
