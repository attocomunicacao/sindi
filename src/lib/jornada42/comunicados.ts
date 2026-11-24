import { ATUALIZADO_EM, FATOS, VALIDO_ATE } from '@/lib/jornada42/fatos';

export type TipoDeComunicado = 'tomador' | 'empregados';

export const MODELOS: { id: TipoDeComunicado; rotulo: string }[] = [
  { id: 'tomador', rotulo: 'Comunicado ao tomador de serviços' },
  { id: 'empregados', rotulo: 'Comunicado aos empregados' },
];

export const AVISO_DO_MODELO = 'Modelo geral, revise com o jurídico antes de enviar.';
export const NOME_PADRAO = '[nome da empresa]';
const LIMITE_DO_NOME = 120;

/** Nome da empresa pronto para entrar no texto: sem caracteres de controle, espaços repetidos nem tamanho absurdo; vazio vira o marcador para preencher à mão. */
export function nomeDaEmpresa(texto: string): string {
  const limpo = texto
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITE_DO_NOME);
  return limpo || NOME_PADRAO;
}

/**
 * Texto estático dos modelos, só com fatos da EC 141/2026 (cerebro/conhecimento/jornada-42.md). Só o nome da empresa é parametrizado,
 * e a montagem acontece no navegador: nada disso é enviado nem guardado. Cada modelo termina com o aviso de revisão e a vigência.
 */
export function textoDoComunicado(tipo: TipoDeComunicado, empresa: string): string {
  const nome = nomeDaEmpresa(empresa);
  const rodape = `${AVISO_DO_MODELO} Atualizado em ${ATUALIZADO_EM.split('-').reverse().join('/')}; válido até ${VALIDO_ATE.split('-').reverse().join('/')}.`;
  if (tipo === 'tomador') {
    return [
      'Assunto: Emenda Constitucional 141/2026 (Jornada 42) e o contrato de prestação de serviços',
      '',
      'Prezados,',
      '',
      `A ${nome} informa que a Emenda Constitucional 141, de 16 de outubro de 2026, reduz a jornada semanal máxima para ${FATOS.horas42} horas a partir de ${FATOS.inicio42} e para ${FATOS.horas40} horas a partir de ${FATOS.inicio40}, com ${FATOS.diasDeRepouso} dias de repouso semanal, um deles preferencialmente aos domingos, sem redução salarial, inclusive nos pisos salariais (arts. 2º e 6º da emenda).`,
      '',
      `Para os contratos administrativos vigentes com emprego direto de mão de obra, o art. 9º da emenda determina o aditivo para manter o equilíbrio econômico-financeiro, no prazo máximo de ${FATOS.prazoAditivoAnos} ano, assegurada a irredutibilidade salarial. Solicitamos reunião para tratar do aditivo e da forma de aplicação ao contrato.`,
      '',
      'Colocamo-nos à disposição para os esclarecimentos necessários.',
      '',
      'Atenciosamente,',
      nome,
      '',
      rodape,
    ].join('\n');
  }
  return [
    'Assunto: Comunicado sobre a nova jornada de trabalho (Emenda Constitucional 141/2026)',
    '',
    'Prezados colaboradores,',
    '',
    `A ${nome} comunica que a Emenda Constitucional 141, de 16 de outubro de 2026, reduz a jornada semanal máxima para ${FATOS.horas42} horas a partir de ${FATOS.inicio42} e para ${FATOS.horas40} horas a partir de ${FATOS.inicio40}, com ${FATOS.diasDeRepouso} dias de repouso semanal, um deles preferencialmente aos domingos.`,
    '',
    'A redução da jornada se aplica aos contratos em vigor sem redução salarial, inclusive nos pisos salariais (art. 2º da emenda).',
    '',
    'As informações sobre a escala de cada setor serão repassadas pela empresa. Em caso de dúvida, procure o seu gestor ou o setor responsável.',
    '',
    'Atenciosamente,',
    nome,
    '',
    rodape,
  ].join('\n');
}
