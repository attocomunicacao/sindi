import { setTimeout as delay } from 'node:timers/promises';
import robotsParser from 'robots-parser';

// Alguns portais governamentais derrubam a conexão de agentes sem o prefixo Mozilla; o nome e o contato continuam identificáveis.
export const AGENTE_DE_USUARIO = 'Mozilla/5.0 (compatible; SINDI-Dados/1.0; +https://www.sindeprestem.com.br)';
const espacamento = new Map<string, number>();
const robots = new Map<string, ReturnType<typeof robotsParser> | null>();
const MAXIMO_DE_BYTES = 30 * 1024 * 1024;

/** Só os testes desligam as esperas (SINDI_HTTP_PAUSA_MS=0): em produção o intervalo entre requisições e as pausas das novas tentativas valem sempre. */
const pausa = (ms: number) => (process.env.SINDI_HTTP_PAUSA_MS === '0' ? 0 : ms);
/** Intervalo mínimo entre requisições ao mesmo domínio, para não sobrecarregar as fontes. */
async function espacar(hostDoDestino: string, minMs: number) {
  const espera = Math.max(0, (espacamento.get(hostDoDestino) ?? 0) - Date.now());
  espacamento.set(hostDoDestino, Math.max(espacamento.get(hostDoDestino) ?? 0, Date.now()) + pausa(minMs));
  if (espera) await delay(pausa(espera));
}
/** Endereço que um coletor nunca deve acessar: IP literal, localhost, nomes sem domínio e sufixos internos. Protege contra um redirecionamento de fonte comprometida para a rede interna. */
export function hostInterno(hostDoDestino: string): boolean {
  const nome = hostDoDestino.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
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
function comTeto(resposta: Response): Response {
  if (!resposta.body) return resposta;
  let total = 0;
  const corpo = resposta.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(pedaco, controle) { total += pedaco.length; if (total > MAXIMO_DE_BYTES) controle.error(new Error('Resposta grande demais')); else controle.enqueue(pedaco); } }));
  return new Response(corpo, { status: resposta.status, statusText: resposta.statusText, headers: resposta.headers });
}
export type OpcoesDeBusca = { minMs?: number; respectRobots?: boolean; accept?: string; headers?: Record<string, string> };

export async function buscarComEducacao(url: string, { minMs = 1000, respectRobots = true, accept, headers = {} }: OpcoesDeBusca = {}): Promise<Response> {
  const alvo = new URL(url);
  destinoPermitido(alvo);
  if (respectRobots) {
    if (!robots.has(alvo.origin)) {
      try {
        const resposta = await fetch(`${alvo.origin}/robots.txt`, { headers: { 'User-Agent': AGENTE_DE_USUARIO }, redirect: 'error', signal: AbortSignal.timeout(20000) });
        robots.set(alvo.origin, resposta.ok ? robotsParser(`${alvo.origin}/robots.txt`, await resposta.text()) : null);
      } catch { robots.set(alvo.origin, null); }
    }
    if (robots.get(alvo.origin)?.isAllowed(url, AGENTE_DE_USUARIO) === false) throw new Error('robots.txt bloqueou: ' + url);
  }
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    await espacar(alvo.host, minMs);
    try {
      // Redirecionamentos são seguidos à mão, e cada destino passa pela mesma validação do endereço inicial.
      let atual = new URL(url); let resposta: Response;
      for (let saltos = 0; ; saltos++) {
        resposta = await fetch(atual, { headers: { 'User-Agent': AGENTE_DE_USUARIO, ...(accept ? { Accept: accept } : {}), ...headers }, redirect: 'manual', signal: AbortSignal.timeout(45000) });
        const destino = resposta.status >= 300 && resposta.status < 400 ? resposta.headers.get('location') : null;
        if (!destino) break;
        if (saltos >= MAX_REDIRECIONAMENTOS) throw new DestinoBloqueado('Redirecionamentos demais: ' + alvo.host);
        atual = new URL(destino, atual); destinoPermitido(atual); await resposta.body?.cancel();
      }
      if (resposta.status === 429 || resposta.status >= 500) { ultimoErro = new Error(`HTTP ${resposta.status} em ${alvo.host}`); await delay(pausa(2000 * (tentativa + 1) * (resposta.status === 429 ? 5 : 1))); continue; }
      if (Number(resposta.headers.get('content-length') || 0) > MAXIMO_DE_BYTES) { await resposta.body?.cancel(); throw new Error('Resposta grande demais'); }
      return comTeto(resposta);
    } catch (cause) { if (cause instanceof DestinoBloqueado) throw cause; ultimoErro = cause; await delay(pausa(1000 * (tentativa + 1))); }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('Falha de rede');
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
export async function buscarJson<T = unknown>(url: string, opcoes: OpcoesDeBusca = {}): Promise<T> {
  const resposta = await buscarComEducacao(url, { minMs: 400, respectRobots: false, accept: 'application/json', ...opcoes });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${new URL(url).host}`);
  return await resposta.json() as T;
}
export async function buscarTexto(url: string, opcoes: OpcoesDeBusca = {}): Promise<string> {
  const resposta = await buscarComEducacao(url, opcoes);
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${new URL(url).host}`);
  return await resposta.text();
}
