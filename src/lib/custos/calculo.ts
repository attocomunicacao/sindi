// Sem dependências de servidor: o mesmo cálculo roda na página /custos e nos testes.
import { modeloPorId, type PrecoDoModelo } from './precos';

/**
 * Estimativa de gasto mensal com uma API paga para a SINDI.
 *
 * Cada mensagem do usuário vira uma chamada ao modelo com as regras, os exemplos, a orientação da área, as fontes e a pergunta (entrada) e a resposta (saída).
 * Quando a verificação de fatos reprova uma resposta, o modelo reescreve: o `fatorDeReescrita` soma essas chamadas extras (medido: ~15%).
 * Com cache de prompt, a parte fixa do pedido (regras e exemplos) é cobrada a cerca de 10% do preço de entrada nas chamadas seguintes; só vale se essa
 * parte passar do mínimo do modelo para cache, por isso começa desligado.
 */
export type Cenario = {
  pessoas: number; mensagensPorDia: number; diasPorMes: number;
  tokensDeEntrada: number; tokensDeSaida: number;
  fatorDeReescrita: number; modelo: string;
  /** Fração da entrada que é fixa (regras e exemplos) e poderia vir do cache. */
  fracaoEmCache: number; usarCache: boolean;
  cambio: number;
};
export type Estimativa = {
  mensagens: number; chamadas: number; tokensEntrada: number; tokensSaida: number;
  custoEntrada: number; custoSaida: number; totalUsd: number; porPessoaUsd: number; porMensagemUsd: number; totalBrl: number; porPessoaBrl: number;
};

export const CENARIO_INTERNO: Cenario = { pessoas: 10, mensagensPorDia: 20, diasPorMes: 22, tokensDeEntrada: 2000, tokensDeSaida: 250, fatorDeReescrita: 1.15, modelo: 'claude-haiku-5-5', fracaoEmCache: 0.55, usarCache: false, cambio: 5.5 };
export const CENARIO_EXTERNO: Cenario = { ...CENARIO_INTERNO, pessoas: 110, mensagensPorDia: 5 };

const positivo = (n: number, max: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0);

export function estimar(c: Cenario, preco: PrecoDoModelo = modeloPorId(c.modelo)): Estimativa {
  const pessoas = positivo(c.pessoas, 1_000_000); const porDia = positivo(c.mensagensPorDia, 10_000); const dias = positivo(c.diasPorMes, 31);
  const mensagens = pessoas * porDia * dias;
  const chamadas = mensagens * Math.max(1, positivo(c.fatorDeReescrita, 5));
  const tokensEntrada = chamadas * positivo(c.tokensDeEntrada, 1_000_000); const tokensSaida = chamadas * positivo(c.tokensDeSaida, 1_000_000);
  const emCache = c.usarCache ? positivo(c.fracaoEmCache, 1) : 0;
  const custoEntrada = (tokensEntrada * (1 - emCache) * preco.entrada + tokensEntrada * emCache * preco.leituraDeCache) / 1e6;
  const custoSaida = (tokensSaida * preco.saida) / 1e6;
  const totalUsd = custoEntrada + custoSaida; const cambio = positivo(c.cambio, 1000);
  return {
    mensagens, chamadas, tokensEntrada, tokensSaida, custoEntrada, custoSaida, totalUsd,
    porPessoaUsd: pessoas ? totalUsd / pessoas : 0, porMensagemUsd: mensagens ? totalUsd / mensagens : 0,
    totalBrl: totalUsd * cambio, porPessoaBrl: pessoas ? (totalUsd * cambio) / pessoas : 0,
  };
}

/** Média real de tokens por chamada, a partir das métricas de /uso (só chamadas com tokens informados). `undefined` se ainda não há dados suficientes. */
export function mediaReal(dias: { inputTokens: number; outputTokens: number; measured: number }[], minimo = 20) {
  const medidas = dias.reduce((s, d) => s + d.measured, 0); if (medidas < minimo) return undefined;
  return { entrada: Math.round(dias.reduce((s, d) => s + d.inputTokens, 0) / medidas), saida: Math.round(dias.reduce((s, d) => s + d.outputTokens, 0) / medidas), chamadas: medidas };
}
