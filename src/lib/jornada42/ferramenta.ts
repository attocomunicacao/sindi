import type { Ferramenta } from '@/lib/ferramentas/tipos';
import type { Passagem } from '@/lib/base/tipos';
import { AVISOS } from '@/lib/produtos/avisos';
import { lerNumero, numeroComCasas } from '@/lib/base/formato';
import { calcularImpacto } from '@/lib/jornada42/impacto';
import { FATOS } from '@/lib/jornada42/fatos';

/** Exemplo do Planalto (19/11/2026), usado quando a pergunta não traz salário: hora R$ 13,64 -> R$ 14,29 (42 horas) -> R$ 15,00 (40 horas). */
export const SALARIO_DO_EXEMPLO = 3000;

export const ORIENTACAO_DA_JORNADA_42 =
  'Apresente só os números e fatos da fonte, sem recalcular nem inventar regra. É custo, nunca preço: não sugira preço, margem nem percentual de repasse. Diga que a emenda não menciona a terceirização nem o trabalho temporário como tais, que é informação geral e que o caso concreto vai ao Setor Jurídico do SINDEPRESTEM. Só chame o salário de exemplo do Planalto se a fonte disser isso; o salário que o usuário informou é dele, não do Planalto. Diga que a página /jornada-42 tem a calculadora do posto, o roteiro por perfil e os modelos de comunicado.';

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const reais = (v: number) => `R$ ${numeroComCasas(v, 2)}`;

/** Reconhece o pedido: cita a Jornada 42 (ou a emenda) e pergunta pelo custo, impacto, posto, salário-hora, divisor ou horas extras. */
export function pedeImpactoDaJornada(pergunta: string): boolean {
  const t = normal(pergunta);
  const jornada = /jornada (de )?42|jornada 40|\bec ?141\b|emenda constitucional 141|42 horas|fim da escala 6x1/.test(
    t,
  );
  const custo =
    /impacto|custo|posto|salario[- ]hora|valor da hora|divisor|hora extra|horas extras|adicional noturno/.test(t);
  return jornada && custo;
}

/** Salário citado na pergunta ("R$ 3.500", "salário de 2800"); sem ele, vale o exemplo do Planalto. */
function salarioDaPergunta(pergunta: string): number | undefined {
  const m = normal(pergunta).match(/(?:r\$\s*|salario(?: base| mensal)?(?: de)?\s*)(\d[\d.,]*)/);
  const n = m ? lerNumero(m[1].replace(/[.,]$/, '')) : undefined;
  return n && n > 0 && n <= 1_000_000 ? n : undefined;
}

/**
 * Impacto da jornada no posto como trecho para o modelo. Todo número que a resposta pode citar (datas, divisores, valores, variação) está no texto,
 * porque a verificação de fatos reprova o que não estiver nas fontes. Os fatos vêm de cerebro/conhecimento/jornada-42.md.
 */
export function impactoDaJornada(pergunta: string): Pick<Passagem, 'url' | 'title' | 'content'> | undefined {
  if (!pedeImpactoDaJornada(pergunta)) return undefined;
  const informado = salarioDaPergunta(pergunta);
  const salario = informado ?? SALARIO_DO_EXEMPLO;
  const r = calcularImpacto({ salario });
  if (!r) return undefined;
  const [hoje, c42, c40] = r.cenarios;
  const linhas = [
    'Kit Jornada 42 (Emenda Constitucional 141/2026): impacto no custo do posto.',
    `Jornada semanal máxima: ${FATOS.horas42} horas a partir de ${FATOS.inicio42} e ${FATOS.horas40} horas a partir de ${FATOS.inicio40}, com ${FATOS.diasDeRepouso} dias de repouso semanal, sem redução salarial, inclusive nos pisos (emenda, arts. 2º e 6º).`,
    `Divisores do salário-hora (${FATOS.decreto}, Planalto, 19/11/2026): ${FATOS.divisor42} na jornada de ${FATOS.horas42} horas e ${FATOS.divisor40} na de ${FATOS.horas40} horas; ${FATOS.divisor44} é o divisor da jornada atual de ${FATOS.horas44} horas.`,
    informado
      ? `Salário mensal informado: ${reais(salario)}.`
      : `Sem salário na pergunta, vale o exemplo do Planalto: salário mensal de ${reais(salario)}.`,
    `Salário-hora na jornada de ${FATOS.horas44} horas (divisor ${hoje.divisor}): ${reais(hoje.salarioHora)}.`,
    `Salário-hora na jornada de ${FATOS.horas42} horas (divisor ${c42.divisor}): ${reais(c42.salarioHora)}, variação de ${numeroComCasas(c42.variacaoPercentual, 2)}% sobre o divisor ${hoje.divisor}.`,
    `Salário-hora na jornada de ${FATOS.horas40} horas (divisor ${c40.divisor}): ${reais(c40.salarioHora)}, variação de ${numeroComCasas(c40.variacaoPercentual, 2)}% sobre o divisor ${hoje.divisor}.`,
    `Hora extra a 50%: ${reais(hoje.horaExtra50)} (${FATOS.divisor44}), ${reais(c42.horaExtra50)} (${FATOS.divisor42}), ${reais(c40.horaExtra50)} (${FATOS.divisor40}). Hora extra a 100%: ${reais(hoje.horaExtra100)}, ${reais(c42.horaExtra100)}, ${reais(c40.horaExtra100)}. Adicional noturno de 20% por hora: ${reais(hoje.adicionalNoturnoHora)}, ${reais(c42.adicionalNoturnoHora)}, ${reais(c40.adicionalNoturnoHora)}.`,
    'O texto da emenda não menciona a terceirização nem o trabalho temporário como tais.',
    `Contratos administrativos vigentes com emprego direto de mão de obra devem ser aditados para manter o equilíbrio econômico-financeiro, no prazo máximo de ${FATOS.prazoAditivoAnos} ano (art. 9º).`,
    AVISOS.custoNaoPreco,
    AVISOS.naoEConsultoria,
  ];
  return { url: '/jornada-42', title: 'Kit Jornada 42: impacto no posto', content: linhas.join('\n') };
}

export const ferramentaJornada42: Ferramenta = {
  id: 'jornada-42',
  pagina: 'jornada42',
  env: ['NEXT_PUBLIC_JORNADA42_AULA_URL'],
  testes: ['tests/lib/jornada42/jornada42.test.ts', 'tests/componentes/interface-jornada42.test.tsx'],
  chat: {
    executar(pergunta) {
      const passagem = impactoDaJornada(pergunta);
      return passagem ? { passagem, orientacao: ORIENTACAO_DA_JORNADA_42 } : undefined;
    },
  },
};
