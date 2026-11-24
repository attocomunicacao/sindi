import { AVISO_SEM_TERCEIRIZACAO, FATOS } from '@/lib/jornada42/fatos';

export type IdDoPerfil = 'contratos-publicos' | 'contratos-privados' | 'temporario' | 'turnos';

export type Pergunta = { id: string; texto: string };
export type Passo = { id: string; texto: string; referencia: string };
export type Perfil = {
  id: IdDoPerfil;
  rotulo: string;
  /** Apresentação do perfil; quando a emenda não trata do tema, ela diz isso. */
  nota: string;
  perguntas: Pergunta[];
};

/** Passos que valem para qualquer perfil, sempre no começo do roteiro. */
const PASSOS_BASE: Passo[] = [
  {
    id: 'datas',
    texto: `Marque as datas no calendário da empresa: a jornada semanal máxima é de ${FATOS.horas42} horas a partir de ${FATOS.inicio42} e de ${FATOS.horas40} horas (8 horas por dia) a partir de ${FATOS.inicio40}, com ${FATOS.diasDeRepouso} dias de repouso semanal, um deles preferencialmente aos domingos.`,
    referencia: 'EC 141/2026, art. 6º, I e II, e nova redação do art. 7º da Constituição',
  },
  {
    id: 'salario',
    texto:
      'Mantenha os salários: a redução da jornada e o aumento do repouso valem para os contratos em vigor sem redução salarial nominal, proporcional ou de qualquer outra espécie, inclusive nos pisos salariais.',
    referencia: 'EC 141/2026, art. 2º',
  },
];

/** Passo que cada resposta "sim" acrescenta. */
const PASSOS_POR_PERGUNTA: Record<string, Passo> = {
  aditivo: {
    id: 'aditivo',
    texto: `Liste os contratos administrativos vigentes com emprego direto de mão de obra: eles devem ser aditados para manter o equilíbrio econômico-financeiro, no prazo máximo de ${FATOS.prazoAditivoAnos} ano, assegurada a irredutibilidade salarial.`,
    referencia: 'EC 141/2026, art. 9º',
  },
  concessao: {
    id: 'concessao',
    texto: 'Confira também as concessões, permissões e parcerias: a regra do aditivo se estende a elas.',
    referencia: 'EC 141/2026, art. 9º',
  },
  privado: {
    id: 'privado',
    texto:
      'Reúna os contratos com tomadores privados e leve-os ao jurídico: o art. 9º trata de contratos administrativos, e este material não traz regra da emenda sobre a revisão de contratos privados.',
    referencia: 'EC 141/2026, art. 9º (trata só de contratos administrativos)',
  },
  convencao: {
    id: 'convencao',
    texto: `Levante as cláusulas de convenção ou acordo coletivo sobre duração do trabalho e repouso semanal: as incompatíveis com a emenda perdem efeito ${FATOS.prazoConvencaoMeses} meses após a publicação (${FATOS.inicio42}). Convenção ou acordo podem ampliar a duração diária para distribuir as 42 horas, respeitados os 2 dias de repouso.`,
    referencia: 'EC 141/2026, arts. 3º e 7º',
  },
  compensatorio: {
    id: 'compensatorio',
    texto:
      'Para regime compensatório, o novo § 2º do art. 7º da Constituição exige que se assegure, em média, 2 dias de repouso no mês, com ao menos 1 dia dentro de cada semana de trabalho.',
    referencia: 'EC 141/2026, art. 7º (§ 2º do art. 7º da Constituição)',
  },
  regimeEspecial: {
    id: 'regimeEspecial',
    texto: `Acompanhe as regulamentações específicas para regimes especiais: o Planalto informa que o Ministério do Trabalho as divulgará.`,
    referencia: `Planalto, 19/11/2026 (${FATOS.decreto})`,
  },
  jornadaCurta: {
    id: 'jornadaCurta',
    texto:
      'Separe os empregados com jornada já fixada em 40 horas semanais ou menos: eles não sofrem redução proporcional.',
    referencia: 'EC 141/2026, art. 4º',
  },
  pequena: {
    id: 'pequena',
    texto:
      'Se a empresa é MEI, microempresa ou de pequeno porte, acompanhe a lei complementar que poderá estabelecer medidas transitórias, condicionadas à manutenção dos níveis de emprego: o texto da emenda só prevê essa possibilidade.',
    referencia: 'EC 141/2026, art. 5º',
  },
};

/** Passo final de todo roteiro: o salário-hora muda de divisor. */
const PASSO_DIVISOR: Passo = {
  id: 'divisor',
  texto: `Recalcule o salário-hora (e o que depende dele, como horas extras e adicional noturno) com o divisor do decreto: ${FATOS.divisor42} na jornada de ${FATOS.horas42} horas e ${FATOS.divisor40} na de ${FATOS.horas40} horas. A calculadora desta página faz a conta do posto.`,
  referencia: `Planalto, 19/11/2026 (${FATOS.decreto})`,
};

const PERGUNTAS = {
  aditivo: { id: 'aditivo', texto: 'Tenho contratos administrativos vigentes com emprego direto de mão de obra' },
  concessao: { id: 'concessao', texto: 'Tenho concessão, permissão ou parceria com a administração pública' },
  privado: { id: 'privado', texto: 'Tenho contratos com tomadores privados' },
  convencao: { id: 'convencao', texto: 'Há convenção ou acordo coletivo com cláusulas de jornada ou de repouso' },
  compensatorio: { id: 'compensatorio', texto: 'Uso regime compensatório de horas' },
  regimeEspecial: { id: 'regimeEspecial', texto: 'Tenho regime especial de trabalho (turnos, plantões, escalas)' },
  jornadaCurta: { id: 'jornadaCurta', texto: 'Há empregados com jornada já fixada em 40 horas semanais ou menos' },
  pequena: { id: 'pequena', texto: 'A empresa é MEI, microempresa ou empresa de pequeno porte' },
} satisfies Record<string, Pergunta>;

const perguntas = (...ids: (keyof typeof PERGUNTAS)[]): Pergunta[] => ids.map((i) => PERGUNTAS[i]);

export const PERFIS: Perfil[] = [
  {
    id: 'contratos-publicos',
    rotulo: 'Prestadora de serviços com contratos públicos',
    nota: AVISO_SEM_TERCEIRIZACAO,
    perguntas: perguntas('aditivo', 'concessao', 'convencao', 'jornadaCurta', 'pequena'),
  },
  {
    id: 'contratos-privados',
    rotulo: 'Prestadora de serviços com contratos privados',
    nota: AVISO_SEM_TERCEIRIZACAO,
    perguntas: perguntas('privado', 'convencao', 'jornadaCurta', 'pequena'),
  },
  {
    id: 'temporario',
    rotulo: 'Empresa de trabalho temporário',
    nota: 'A emenda não menciona o trabalho temporário como tal: este roteiro só aplica as regras gerais que o texto traz, e o que vale para o seu caso é pergunta ao jurídico.',
    perguntas: perguntas('convencao', 'jornadaCurta', 'pequena'),
  },
  {
    id: 'turnos',
    rotulo: 'Empresa com escala 12x36 ou turnos',
    nota: 'Este material não traz regra da emenda específica para a escala 12x36 pelo nome: o roteiro mostra o que o texto diz sobre regime compensatório e manda acompanhar a regulamentação dos regimes especiais.',
    perguntas: perguntas('compensatorio', 'regimeEspecial', 'convencao', 'jornadaCurta', 'pequena'),
  },
];

/**
 * Roteiro em ordem: passos-base, depois um passo por pergunta marcada (na ordem das perguntas do perfil) e, por fim, o divisor do salário-hora.
 * Perguntas que não pertencem ao perfil são ignoradas, para que uma marcação antiga não vaze ao trocar de perfil.
 */
export function roteiroDoPerfil(id: IdDoPerfil, marcadas: readonly string[]): Passo[] {
  const perfil = PERFIS.find((p) => p.id === id);
  if (!perfil) return [];
  const daResposta = perfil.perguntas.filter((p) => marcadas.includes(p.id)).map((p) => PASSOS_POR_PERGUNTA[p.id]);
  return [...PASSOS_BASE, ...daResposta, PASSO_DIVISOR];
}
