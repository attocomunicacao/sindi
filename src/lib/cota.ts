/**
 * Cota de mensagens: um limite por pessoa (IP) e um teto geral por dia, para que o nível gratuito do provedor de IA não se esgote por abuso ou por um único usuário.
 * Conta mensagens, não gerações: as reescritas internas de uma mesma pergunta não gastam a cota. Não guarda texto, só contadores; o IP vira um hash e nunca é gravado.
 *
 * - `SINDI_COTA_IP_DIA` (padrão 20) e `SINDI_COTA_GLOBAL_DIA` (padrão 300): mensagens por dia. `0` desliga o limite correspondente.
 * - Com Redis (Upstash) a contagem é compartilhada entre processos e sobrevive a reinícios; sem ele, fica na memória deste processo.
 * - IP do visitante: ver `ipDoPedido` (repasse assinado da Vercel, `SINDI_IP_HEADER` ou `cf-connecting-ip`).
 * - O dia vira à meia-noite de São Paulo, o mesmo dia das métricas de uso.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
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

/** O pedido veio pelo repasse da Vercel (deployment/vercel-proxy), que assina com `SINDI_REPASSE_SEGREDO`: só então o IP que ele informa é confiável. */
function repasseConfiavel(request: Request) {
  const esperado = process.env.SINDI_REPASSE_SEGREDO ?? ''; const recebido = request.headers.get('x-sindi-repasse') ?? '';
  return esperado.length >= 32 && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}
/**
 * IP do visitante. Ordem de confiança:
 * 1. repasse assinado da Vercel (`x-sindi-ip`, com o segredo certo);
 * 2. `SINDI_IP_HEADER`, se configurado (só esse cabeçalho);
 * 3. `cf-connecting-ip` primeiro, porque o túnel da Cloudflare o escreve e quem chama o túnel direto não consegue forjá-lo; depois os da Vercel.
 * Sem nenhum, todos caem em um mesmo grupo, que só o teto geral limita.
 */
export function ipDoPedido(request: Request) {
  if (repasseConfiavel(request)) { const ip = request.headers.get('x-sindi-ip')?.split(',')[0]?.trim(); if (ip && ip.length <= 64) return ip; }
  const nomes = process.env.SINDI_IP_HEADER ? [process.env.SINDI_IP_HEADER] : ['cf-connecting-ip', 'x-vercel-forwarded-for', 'x-real-ip'];
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

async function lerContagem(chave: string, dia: string): Promise<number> {
  if (redisConfigurado()) {
    try { return Number(await redis(['GET', chave])) || 0; } catch { /* Redis fora do ar: vale a contagem local. */ }
  }
  return diaDaMemoria === dia ? memoria.get(chave) ?? 0 : 0;
}
/**
 * Consulta, sem consumir, se ainda há cota para o visitante e no teto geral. Chamada antes da busca: quem já esgotou a cota não gasta
 * embeddings nem leituras da biblioteca. O consumo de verdade continua em `consumirCota`, depois que se sabe que o provedor será usado.
 */
export async function cotaDisponivel(request: Request, agora = new Date()): Promise<ResultadoCota> {
  const dia = diaDaCota(agora); const reiniciaEmSegundos = segundosAteOReinicio(agora);
  const porIp = limiteIpDia(); const geral = limiteGlobalDia();
  if (porIp > 0 && await lerContagem(chaveDe('ip', dia, ipDoPedido(request)), dia) >= porIp) return { ok: false, restantes: 0, limite: porIp, reiniciaEmSegundos, motivo: 'ip' };
  if (geral > 0 && await lerContagem(chaveDe('global', dia), dia) >= geral) return { ok: false, restantes: 0, limite: porIp || undefined, reiniciaEmSegundos, motivo: 'global' };
  return { ok: true, limite: porIp || undefined, reiniciaEmSegundos };
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
