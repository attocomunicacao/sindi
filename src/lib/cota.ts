/**
 * Cota de mensagens: um limite por pessoa (IP) e um teto geral por dia, para que o nível gratuito do provedor de IA não se esgote por abuso ou por um único usuário.
 * Conta mensagens, não gerações: as reescritas internas de uma mesma pergunta não gastam a cota. Não guarda texto, só contadores; o IP vira um hash e nunca é gravado.
 *
 * - `SINDI_COTA_IP_DIA` (padrão 20) e `SINDI_COTA_GLOBAL_DIA` (padrão 300): mensagens por dia. `0` desliga o limite correspondente.
 * - Com Redis (Upstash) a contagem é compartilhada entre processos e sobrevive a reinícios; sem ele, fica na memória deste processo.
 * - `SINDI_IP_HEADER`: cabeçalho que traz o IP do visitante. Padrão: o primeiro que existir entre x-vercel-forwarded-for, x-real-ip e cf-connecting-ip.
 *   Atrás de mais de um repasse (Vercel → túnel), confirme qual deles chega com o IP do visitante e não o do repasse.
 * - O dia vira à meia-noite de São Paulo, o mesmo dia das métricas de uso.
 */
import { createHash } from 'node:crypto';
import { redis, redisConfigurado } from './redis';

const FUSO = 'America/Sao_Paulo';
export type ResultadoCota = { ok: boolean; restantes?: number; limite?: number; reiniciaEmSegundos: number; motivo?: 'ip' | 'global' };

const limite = (valor: string | undefined, padrao: number) => { const n = Number(valor); return valor !== undefined && valor !== '' && Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : padrao; };
export const limiteIpDia = () => limite(process.env.SINDI_COTA_IP_DIA, 20);
export const limiteGlobalDia = () => limite(process.env.SINDI_COTA_GLOBAL_DIA, 300);

export function diaDaCota(agora = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora); }
export function segundosAteOReinicio(agora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(agora).map(p => [p.type, Number(p.value)]));
  return Math.max(1, 86400 - (partes.hour * 3600 + partes.minute * 60 + partes.second));
}

/** IP do visitante a partir do cabeçalho configurado; sem ele, todos caem em um mesmo grupo, que só o teto geral limita. */
export function ipDoPedido(request: Request) {
  const nomes = process.env.SINDI_IP_HEADER ? [process.env.SINDI_IP_HEADER] : ['x-vercel-forwarded-for', 'x-real-ip', 'cf-connecting-ip'];
  for (const nome of nomes) {
    const valor = request.headers.get(nome)?.split(',')[0]?.trim();
    if (valor && valor.length <= 64) return valor;
  }
  return 'desconhecido';
}
const chaveDe = (tipo: string, dia: string, alvo = '') => `sindi:cota:${tipo}:${dia}:${alvo ? createHash('sha256').update(`${process.env.SINDI_COTA_SAL ?? ''}|${dia}|${alvo}`).digest('hex').slice(0, 32) : 'todos'}`;

// Contagem em memória (sem Redis): só vale para este processo e é descartada quando o dia muda.
const memoria = new Map<string, number>(); let diaDaMemoria = '';
/** Teto de IPs distintos contados em memória; acima dele novos IPs são recusados em vez de a memória crescer sem limite. `SINDI_COTA_MAX_CHAVES` ajusta (os testes usam um valor baixo). */
const maximoNaMemoria = () => { const n = Number(process.env.SINDI_COTA_MAX_CHAVES); return Number.isInteger(n) && n > 0 ? n : 100_000; };
function contarNaMemoria(chave: string, dia: string) {
  if (diaDaMemoria !== dia) { memoria.clear(); diaDaMemoria = dia; }
  if (!memoria.has(chave) && memoria.size >= maximoNaMemoria()) return Number.MAX_SAFE_INTEGER;
  const n = (memoria.get(chave) ?? 0) + 1; memoria.set(chave, n); return n;
}
const SCRIPT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`;
async function contar(chave: string, dia: string): Promise<number> {
  if (redisConfigurado()) {
    try { return Number(await redis(['EVAL', SCRIPT, 1, chave, 172800])); } catch { /* Redis fora do ar: a contagem local ainda protege este processo. */ }
  }
  return contarNaMemoria(chave, dia);
}

/** Consome uma mensagem da cota do visitante e do teto geral. Chamar só quando o provedor de IA for realmente usado. */
export async function consumirCota(request: Request, agora = new Date()): Promise<ResultadoCota> {
  const dia = diaDaCota(agora); const reiniciaEmSegundos = segundosAteOReinicio(agora);
  const porIp = limiteIpDia(); const geral = limiteGlobalDia();
  let restantes: number | undefined;
  if (porIp > 0) {
    const usadas = await contar(chaveDe('ip', dia, ipDoPedido(request)), dia);
    if (usadas > porIp) return { ok: false, restantes: 0, limite: porIp, reiniciaEmSegundos, motivo: 'ip' };
    restantes = porIp - usadas;
  }
  if (geral > 0) {
    const usadas = await contar(chaveDe('global', dia), dia);
    if (usadas > geral) return { ok: false, restantes: 0, limite: porIp || undefined, reiniciaEmSegundos, motivo: 'global' };
  }
  return { ok: true, restantes, limite: porIp || undefined, reiniciaEmSegundos };
}

export function mensagemDeCota(resultado: ResultadoCota) {
  const horas = Math.floor(resultado.reiniciaEmSegundos / 3600); const minutos = Math.ceil((resultado.reiniciaEmSegundos % 3600) / 60);
  const quando = horas > 0 ? `${horas} h${minutos ? ` ${minutos} min` : ''}` : `${Math.max(1, minutos)} min`;
  return resultado.motivo === 'global'
    ? `A SINDI atingiu o limite de mensagens de hoje. Ela volta a responder em cerca de ${quando}.`
    : `Você atingiu o limite de ${resultado.limite} mensagens de hoje. Ela volta a responder para você em cerca de ${quando}.`;
}

/** Só para testes. */
export function reiniciarCotaNaMemoria() { memoria.clear(); diaDaMemoria = ''; }
