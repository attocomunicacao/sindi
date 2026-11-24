// Datas do painel no horário de São Paulo; valor ausente vira travessão.
const FUSO = 'America/Sao_Paulo';

export const dataCurta = (valor?: string | null) => valor ? new Date(valor).toLocaleDateString('pt-BR', { timeZone: FUSO }) : '—';
export const dataEHora = (valor?: string | null) => valor ? new Date(valor).toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Nome por extenso de cada fonte de dados coletada. */
export const NOMES_DAS_FONTES: Record<string, string> = {
  bcb: 'Banco Central', ibge: 'IBGE', camara: 'Câmara', senado: 'Senado', tst: 'TST', wec: 'WEC', sindeprestem: 'SINDEPRESTEM',
  mte: 'Ministério do Trabalho', caged: 'Novo CAGED', constituicao: 'Constituição', regimentos: 'Regimentos',
};
