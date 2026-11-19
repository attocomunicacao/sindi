import { setTimeout as delay } from 'node:timers/promises';
import robotsParser from 'robots-parser';

// Alguns portais governamentais derrubam a conexão de agentes sem o prefixo Mozilla; o nome e o contato continuam identificáveis.
export const AGENT = 'Mozilla/5.0 (compatible; SINDI-Dados/1.0; +https://www.sindeprestem.com.br)';
const spacing = new Map<string, number>();
const robots = new Map<string, ReturnType<typeof robotsParser> | null>();
const MAX_BYTES = 30 * 1024 * 1024;

/** Só os testes desligam as esperas (SINDI_HTTP_PAUSA_MS=0): em produção o intervalo entre requisições e as pausas das novas tentativas valem sempre. */
const pausa = (ms: number) => (process.env.SINDI_HTTP_PAUSA_MS === '0' ? 0 : ms);
/** Intervalo mínimo entre requisições ao mesmo domínio, para não sobrecarregar as fontes. */
async function throttle(host: string, minMs: number) {
  const wait = Math.max(0, (spacing.get(host) ?? 0) - Date.now());
  spacing.set(host, Math.max(spacing.get(host) ?? 0, Date.now()) + pausa(minMs));
  if (wait) await delay(pausa(wait));
}
/** Endereço que um coletor nunca deve acessar: IP literal, localhost, nomes sem domínio e sufixos internos. Protege contra um redirecionamento de fonte comprometida para a rede interna. */
export function hostInterno(host: string): boolean {
  const nome = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return !nome.includes('.') || nome.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(nome) || /^\d+$/.test(nome) || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(nome);
}
/** Destino recusado pela validação (ou redirecionamentos em excesso): não adianta tentar de novo. */
export class DestinoBloqueado extends Error {}
/** Valida o destino (https, sem credenciais, sem porta diferente de 443 e fora da rede interna). */
export function destinoPermitido(url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password) throw new DestinoBloqueado('Somente HTTPS sem credenciais: ' + url.host);
  if (url.port && url.port !== '443') throw new DestinoBloqueado('Porta não permitida: ' + url.host);
  if (hostInterno(url.hostname)) throw new DestinoBloqueado('Endereço interno bloqueado: ' + url.hostname);
}
const MAX_REDIRECIONAMENTOS = 4;
/** O corpo é lido com teto de tamanho mesmo sem content-length: passou do limite, a leitura falha. */
function comTeto(response: Response): Response {
  if (!response.body) return response;
  let total = 0;
  const corpo = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(pedaco, controle) { total += pedaco.length; if (total > MAX_BYTES) controle.error(new Error('Resposta grande demais')); else controle.enqueue(pedaco); } }));
  return new Response(corpo, { status: response.status, statusText: response.statusText, headers: response.headers });
}
export type FetchOptions = { minMs?: number; respectRobots?: boolean; accept?: string; headers?: Record<string, string> };

export async function politeFetch(url: string, { minMs = 1000, respectRobots = true, accept, headers = {} }: FetchOptions = {}): Promise<Response> {
  const target = new URL(url);
  destinoPermitido(target);
  if (respectRobots) {
    if (!robots.has(target.origin)) {
      try {
        const response = await fetch(`${target.origin}/robots.txt`, { headers: { 'User-Agent': AGENT }, redirect: 'error', signal: AbortSignal.timeout(20000) });
        robots.set(target.origin, response.ok ? robotsParser(`${target.origin}/robots.txt`, await response.text()) : null);
      } catch { robots.set(target.origin, null); }
    }
    if (robots.get(target.origin)?.isAllowed(url, AGENT) === false) throw new Error('robots.txt bloqueou: ' + url);
  }
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle(target.host, minMs);
    try {
      // Redirecionamentos são seguidos à mão, e cada destino passa pela mesma validação do endereço inicial.
      let atual = new URL(url); let response: Response;
      for (let saltos = 0; ; saltos++) {
        response = await fetch(atual, { headers: { 'User-Agent': AGENT, ...(accept ? { Accept: accept } : {}), ...headers }, redirect: 'manual', signal: AbortSignal.timeout(45000) });
        const destino = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
        if (!destino) break;
        if (saltos >= MAX_REDIRECIONAMENTOS) throw new DestinoBloqueado('Redirecionamentos demais: ' + target.host);
        atual = new URL(destino, atual); destinoPermitido(atual); await response.body?.cancel();
      }
      if (response.status === 429 || response.status >= 500) { last = new Error(`HTTP ${response.status} em ${target.host}`); await delay(pausa(2000 * (attempt + 1) * (response.status === 429 ? 5 : 1))); continue; }
      if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) { await response.body?.cancel(); throw new Error('Resposta grande demais'); }
      return comTeto(response);
    } catch (cause) { if (cause instanceof DestinoBloqueado) throw cause; last = cause; await delay(pausa(1000 * (attempt + 1))); }
  }
  throw last instanceof Error ? last : new Error('Falha de rede');
}
/** Garante que o campo de uma resposta externa é uma lista; senão a coleta falha com um erro claro, em vez de um TypeError no meio do lote. */
export function listaOuErro<T = unknown>(valor: unknown, onde: string): T[] {
  if (!Array.isArray(valor)) throw new Error(`Resposta inesperada de ${onde}`);
  return valor as T[];
}
/**
 * Data ISO de um texto de data de fonte externa, ou `undefined` se não for uma data válida. Só aceita o formato ISO (AAAA-MM-DD...): o leitor de datas do V8
 * aceita textos como "ontem" e devolve uma data qualquer. Uma data com hora e sem fuso ("2026-10-01T10:30") depende do fuso do computador; `fuso` (ex.: "-03:00") a fixa.
 */
export function dataIso(texto: string | undefined | null, { fuso }: { fuso?: string } = {}): string | undefined {
  if (typeof texto !== 'string') return undefined;
  let t = texto.trim(); if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return undefined;
  if (fuso && /T\d{2}:\d{2}(?::\d{2})?$/.test(t)) t = `${/T\d{2}:\d{2}$/.test(t) ? `${t}:00` : t}${fuso}`;
  const d = new Date(t); return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
export async function getJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await politeFetch(url, { minMs: 400, respectRobots: false, accept: 'application/json', ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(url).host}`);
  return await response.json() as T;
}
export async function getText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await politeFetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(url).host}`);
  return await response.text();
}
