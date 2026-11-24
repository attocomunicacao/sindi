import { existsSync } from 'node:fs';
import type { PassagemFixa } from '@/lib/base/tipos';
import { normalizar } from '@/lib/base/texto';
import { mesAno } from '@/lib/base/formato';
import { caminhoDoBanco } from '@/lib/dados/db';
import { PEDIDO_DE_REDACAO } from '@/lib/recuperacao/intencao';
import { fraseDoIndicador } from '@/lib/dados/frase-do-indicador';
import { lerPainel } from '@/lib/dados/painel';

const PERGUNTAS_DE_INDICADOR: [RegExp, string[]][] = [
  [/\bselic\b|juros b[aá]sicos|taxa b[aá]sica de juros/, ['bcb.selic-meta']],
  [/\bipca\b|infla[cç][aã]o|inflation/, ['ibge.ipca-12m', 'ibge.ipca-mensal']],
  [/desemprego|desocupa[cç][aã]o|unemployment|\bpnad\b/, ['ibge.desocupacao']],
  [/\bcaged\b|empregos? forma(l|is)|empregos? (foram )?(gerados|criados)|vagas formais|saldo de (emprego|vagas)|mercado de trabalho/, ['caged.saldo', 'caged.saldo-sp', 'caged.saldo-servicos', 'caged.saldo-temporario']],
  [/volume de servi[cç]os|pesquisa mensal de servi[cç]os|\bpms\b/, ['ibge.servicos']],
];
/** Recortes do Novo CAGED que a pergunta cita (serviços, trabalho temporário, São Paulo); sem recorte citado, todos. Menos números na fonte, menos troca de número na resposta. */
function recorteDoCaged(q: string, ids: string[]): string[] {
  const pedidos = [/servic/.test(q) && 'caged.saldo-servicos', /temporari/.test(q) && 'caged.saldo-temporario', /sao paulo|paulista|\bsp\b|estado/.test(q) && 'caged.saldo-sp'].filter((id): id is string => Boolean(id));
  return pedidos.length ? ids.filter(id => !id.startsWith('caged.') || pedidos.includes(id)) : ids;
}
/**
 * Números oficiais mais recentes que a pergunta menciona, entregues ao modelo como trechos (um por indicador, com a fonte); a SINDI explica o número
 * com palavras próprias em vez de devolver uma ficha pronta. Perguntas de definição ("O que é o CAGED?") não trazem números: vão ao glossário do cérebro.
 */
export function trechosDeIndicadores(pergunta: string, arquivo = caminhoDoBanco()): PassagemFixa[] {
  const q = normalizar(pergunta);
  if (PEDIDO_DE_REDACAO.test(q)) return [];
  if (/^(o que (e|significa|quer dizer)|what (is|does)|para que serve|defina|qual (e )?o significado)/.test(q.trim()) && /\b(caged|pnad|pms|ipca|selic)\b/.test(q)) return [];
  const ids = recorteDoCaged(q, PERGUNTAS_DE_INDICADOR.filter(([test]) => test.test(q)).flatMap(([, lista]) => lista));
  if (!ids.length || !existsSync(arquivo)) return [];
  // Recorte que só existe como série mensal (trabalho temporário ou serviços no Estado de São Paulo): os dois últimos meses, como um indicador.
  const emSp = /sao paulo|paulista|\bsp\b/.test(q); const serieSp = emSp && /temporari/.test(q) ? 'caged.saldo-temporario-sp' : emSp && /servic/.test(q) ? 'caged.saldo-servicos-sp' : undefined;
  if (serieSp && ids.some(id => id.startsWith('caged.'))) {
    const painel = lerPainel(arquivo); const serie = painel.series[serieSp] ?? []; const indicadorBase = painel.indicators.find(i => i.id === serieSp.replace(/-sp$/, ''));
    if (serie.length && indicadorBase) return [{ url: indicadorBase.url, title: `${indicadorBase.label} — Estado de São Paulo`, fetchedAt: indicadorBase.fetchedAt, pinned: true as const,
      content: fraseDoIndicador({ ...indicadorBase, label: `${indicadorBase.label} — Estado de São Paulo`, value: serie.at(-1)!.value, period: mesAno(serie.at(-1)!.period), previous: serie.at(-2)?.value ?? null }) }];
  }
  return lerPainel(arquivo).indicators.filter(i => ids.includes(i.id)).map(i => ({ url: i.url, title: i.label, fetchedAt: i.fetchedAt, pinned: true as const, content: fraseDoIndicador(i) }));
}
