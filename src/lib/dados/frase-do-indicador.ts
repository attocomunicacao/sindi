import { numeroDoIndicador } from '@/lib/base/formato';
import type { IndicadorDoPainel } from '@/lib/dados/painel';

const ROTULO_DA_FONTE: Record<string, string> = { bcb: 'Banco Central', ibge: 'IBGE', caged: 'Novo CAGED (Ministério do Trabalho e Emprego)' };
/**
 * Um indicador como frase completa, com o sentido do número já dito ("abriu", "fechou", "subiu", "caiu"). Um modelo pequeno copia bem uma frase, mas erra ao
 * interpretar sinal e variação: aqui a conta e a comparação são feitas pelo código, e o modelo só escolhe e redige.
 */
export function fraseDoIndicador(i: IndicadorDoPainel): string {
  const numero = (valor: number) => numeroDoIndicador(Math.abs(valor), i.unit, 'pt-BR');
  const fonte = ROTULO_DA_FONTE[i.source] ?? i.source.toUpperCase();
  if (/vagas/.test(i.unit)) {
    // O dado mais recente vem primeiro e rotulado: medido, até o modelo de 3B respondeu com o número do mês anterior quando os dois vinham na mesma oração.
    const saldo = (valor: number) => `${valor < 0 ? 'fechou' : 'abriu'} ${numero(valor)} vagas formais`;
    return `${i.label}, dado mais recente (${i.period}): ${saldo(i.value)} (admissões menos demissões). Fonte: ${fonte}.${i.previous != null ? ` Para comparação, no mês anterior: ${saldo(i.previous)}.` : ''}`;
  }
  const sinal = (valor: number) => `${valor < 0 ? '-' : ''}${numero(valor)}`;
  const variacao = i.previous == null ? '' : i.value > i.previous ? `; subiu em relação ao valor anterior (${sinal(i.previous)})` : i.value < i.previous ? `; caiu em relação ao valor anterior (${sinal(i.previous)})` : `; igual ao valor anterior (${sinal(i.previous)})`;
  return `${i.label}: ${sinal(i.value)} ${i.unit} (${i.period})${variacao}. Fonte: ${fonte}.`;
}
