import { setTimeout as delay } from 'node:timers/promises';
import robotsParser from 'robots-parser';

// Alguns portais governamentais derrubam a conexão de agentes sem o prefixo Mozilla; o nome e o contato continuam identificáveis.
export const AGENT = 'Mozilla/5.0 (compatible; SINDI-Dados/1.0; +https://www.sindeprestem.com.br)';
const spacing = new Map<string, number>();
const robots = new Map<string, ReturnType<typeof robotsParser> | null>();
const MAX_BYTES = 30 * 1024 * 1024;

/** Intervalo mínimo entre requisições ao mesmo domínio, para não sobrecarregar as fontes. */
async function throttle(host: string, minMs: number) {
  const wait = Math.max(0, (spacing.get(host) ?? 0) - Date.now());
  spacing.set(host, Math.max(spacing.get(host) ?? 0, Date.now()) + minMs);
  if (wait) await delay(wait);
}
export type FetchOptions = { minMs?: number; respectRobots?: boolean; accept?: string; headers?: Record<string, string> };

export async function politeFetch(url: string, { minMs = 1000, respectRobots = true, accept, headers = {} }: FetchOptions = {}): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Somente HTTPS sem credenciais: ' + target.host);
  if (respectRobots) {
    if (!robots.has(target.origin)) {
      try {
        const response = await fetch(`${target.origin}/robots.txt`, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20000) });
        robots.set(target.origin, response.ok ? robotsParser(`${target.origin}/robots.txt`, await response.text()) : null);
      } catch { robots.set(target.origin, null); }
    }
    if (robots.get(target.origin)?.isAllowed(url, AGENT) === false) throw new Error('robots.txt bloqueou: ' + url);
  }
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle(target.host, minMs);
    try {
      const response = await fetch(url, { headers: { 'User-Agent': AGENT, ...(accept ? { Accept: accept } : {}), ...headers }, signal: AbortSignal.timeout(45000) });
      if (response.status === 429 || response.status >= 500) { last = new Error(`HTTP ${response.status}`); await delay(2000 * (attempt + 1) * (response.status === 429 ? 5 : 1)); continue; }
      if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('Resposta grande demais');
      return response;
    } catch (cause) { last = cause; await delay(1000 * (attempt + 1)); }
  }
  throw last instanceof Error ? last : new Error('Falha de rede');
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
