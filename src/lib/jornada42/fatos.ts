// Sem dependências: usado pela página (navegador) e pelo chat (servidor).
/**
 * Fatos da Emenda Constitucional 141/2026 que o Kit Jornada 42 usa, todos de cerebro/conhecimento/jornada-42.md
 * (fonte oficial: texto da emenda no Planalto). Ficam num só lugar para o roteiro, o cálculo, os comunicados e o chat
 * dizerem a mesma coisa; o que o texto da emenda não diz não entra aqui. Reconferir antes de `VALIDO_ATE`.
 */
export const FONTE_OFICIAL = 'https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc141.htm';
export const ATUALIZADO_EM = '2026-11-24';
export const VALIDO_ATE = '2026-12-31';

export const FATOS = {
  inicio42: '16/12/2026',
  inicio40: '16/12/2027',
  horas44: 44,
  horas42: 42,
  horas40: 40,
  diasDeRepouso: 2,
  prazoConvencaoMeses: 2,
  prazoAditivoAnos: 1,
  decreto: 'Decreto nº 13.173/2026',
  /** Divisores do salário-hora: 220 é o da jornada atual de 44 horas (o exemplo do Planalto confirma: 3.000/220 = 13,64). */
  divisor44: 220,
  divisor42: 210,
  divisor40: 200,
} as const;

/** Aviso que acompanha cada passo e cada modelo: o texto da emenda é geral, o caso concreto é do jurídico. */
export const AVISO_JURIDICO =
  'Caso concreto: leve ao Setor Jurídico do SINDEPRESTEM ou ao seu advogado antes de decidir.';
/** A emenda não trata de terceirização nem de trabalho temporário como tais; dizer isso evita inventar regra. */
export const AVISO_SEM_TERCEIRIZACAO =
  'O texto da emenda não menciona a terceirização nem o trabalho temporário como tais; este roteiro só aplica as regras gerais que o texto traz.';
