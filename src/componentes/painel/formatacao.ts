// Datas do painel no horário de São Paulo; valor ausente vira travessão.
import { dataBR, dataEHoraBR } from '@/lib/base/formato';

export const dataCurta = (valor?: string | null) => (valor ? dataBR(valor) : '—');
export const dataEHora = (valor?: string | null) => (valor ? dataEHoraBR(valor) : '—');

/** Nome por extenso de cada fonte de dados coletada. */
export const NOMES_DAS_FONTES: Record<string, string> = {
  bcb: 'Banco Central',
  ibge: 'IBGE',
  camara: 'Câmara',
  senado: 'Senado',
  tst: 'TST',
  wec: 'WEC',
  sindeprestem: 'SINDEPRESTEM',
  mte: 'Ministério do Trabalho',
  caged: 'Novo CAGED',
  constituicao: 'Constituição',
  regimentos: 'Regimentos',
};
