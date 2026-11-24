// Sem dependências do servidor: o resumo de "o que o cérebro entregou nesta resposta" também é lido no navegador (/cerebro acende esses nós).
import type { OrigemDaFonte, Passagem } from '@/lib/base/tipos';

/**
 * O que o cérebro entregou para uma resposta: a área (conector) que a atendeu, a situação tratada por regra (se houve), de onde vieram as fontes e
 * os nós do grafo que elas representam. Só ids de nós públicos e rótulos curtos: nunca a pergunta, a resposta ou o texto das fontes.
 */
export type UsoDoCerebro = {
  conector?: string;
  situacao?: string;
  origens: OrigemDaFonte[];
  nos: string[];
};

const ID_SEGURO = /^[a-z0-9][a-z0-9:_./?=-]{0,160}$/i;
const ORIGENS: OrigemDaFonte[] = ['cerebro', 'biblioteca', 'grafo', 'externa', 'documento', 'ferramenta', 'contato'];
const MAX_NOS = 12;

/** Resume as fontes que foram ao modelo (as mesmas das referências), sem repetir origem nem nó. */
export function resumirUsoDoCerebro(entrada: {
  conector?: { id: string };
  situacao?: string;
  fontes: Pick<Passagem, 'origem' | 'no'>[];
}): UsoDoCerebro {
  const origens = [...new Set(entrada.fontes.map((f) => f.origem).filter((o): o is OrigemDaFonte => Boolean(o)))];
  const nos = [...new Set(entrada.fontes.map((f) => f.no).filter((n): n is string => Boolean(n && ID_SEGURO.test(n))))];
  return {
    conector: entrada.conector?.id,
    situacao: entrada.situacao,
    origens,
    nos: nos.slice(0, MAX_NOS),
  };
}

/** Lê o resumo vindo da rede (navegador): descarta qualquer coisa fora do formato, sem confiar no que chegou. */
export function lerUsoDoCerebro(bruto: unknown): UsoDoCerebro | undefined {
  if (!bruto || typeof bruto !== 'object') return undefined;
  const b = bruto as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' && ID_SEGURO.test(v) ? v : undefined);
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    conector: texto(b.conector),
    situacao: texto(b.situacao),
    origens: lista(b.origens).filter((o): o is OrigemDaFonte => ORIGENS.includes(o as OrigemDaFonte)),
    nos: lista(b.nos)
      .map(texto)
      .filter((n): n is string => Boolean(n))
      .slice(0, MAX_NOS),
  };
}

/** Os nós do grafo a acender: a SINDI, a área que atendeu e os nós das fontes (o caminho SINDI → área → estante/conhecimento). */
export function nosParaAcender(uso: UsoDoCerebro): string[] {
  return ['sindi', ...(uso.conector ? [`conector:${uso.conector}`] : []), ...uso.nos];
}

/** Chaves de métrica agregada (contadores do dia): por área, por origem das fontes e por situação; sem conteúdo nem identificação de quem perguntou. */
export function chavesDeMetricaDoCerebro(uso: UsoDoCerebro): string[] {
  return [
    `conector:${uso.conector ?? 'nenhum'}`,
    ...(uso.situacao ? [`situacao:${uso.situacao}`] : []),
    ...(uso.origens.length ? uso.origens.map((o) => `origem:${o}`) : ['origem:nenhuma']),
  ].map((c) => c.slice(0, 60));
}
