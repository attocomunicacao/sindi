import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HOSTS = new Set(['sindeprestem.com.br', 'www.sindeprestem.com.br']);
export const LIMITE_PDF = 80 * 1024 * 1024;
/** O cache em disco tem teto de arquivos e de bytes (os mais antigos saem primeiro) e validade: sem isso, varrer ids encheria o disco. */
export const CACHE_MAX_ARQUIVOS = 60; export const CACHE_MAX_BYTES = 600 * 1024 * 1024; export const CACHE_VALIDADE_MS = 7 * 24 * 3600 * 1000;

/** Só PDFs do domínio do SINDEPRESTEM, por https e sem credenciais ou porta; qualquer outra origem nunca passa pelo servidor. */
export function pdfPermitido(valor: string): URL | undefined {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && HOSTS.has(url.hostname) && !url.username && !url.password && !url.port && /\.pdf$/i.test(url.pathname) ? url : undefined;
  } catch { return undefined; }
}

const pasta = () => path.join(process.cwd(), '.data', 'pdf-cache');
/** O nome inclui um hash do endereço de origem: se o documento mudar de endereço (ou os ids forem reaproveitados), a cópia antiga não é servida. */
export const arquivoDoCache = (id: number, url: URL) => path.join(pasta(), `${id}-${createHash('sha256').update(url.href).digest('hex').slice(0, 12)}.pdf`);
const ehPdf = (bytes: Uint8Array) => bytes.length > 5 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';

/** Entrega o PDF: cópia em disco se houver; senão baixa da origem, confere tipo, tamanho e assinatura %PDF- e guarda a cópia (falha de gravação não impede a leitura). */
export async function podarCache(pastaDoCache = pasta(), agora = Date.now(), limites = { arquivos: CACHE_MAX_ARQUIVOS, bytes: CACHE_MAX_BYTES, validadeMs: CACHE_VALIDADE_MS }) {
  let itens: { arquivo: string; tamanho: number; quando: number }[] = [];
  try { itens = await Promise.all((await readdir(pastaDoCache)).filter(n => n.endsWith('.pdf')).map(async n => { const arquivo = path.join(pastaDoCache, n); const s = await stat(arquivo); return { arquivo, tamanho: s.size, quando: s.mtimeMs }; })); } catch { return 0; }
  itens.sort((a, b) => b.quando - a.quando);
  let guardados = 0; let bytes = 0; let removidos = 0;
  for (const item of itens) {
    if (agora - item.quando > limites.validadeMs || guardados >= limites.arquivos || bytes + item.tamanho > limites.bytes) { await unlink(item.arquivo).then(() => removidos++, () => {}); continue; }
    guardados++; bytes += item.tamanho;
  }
  return removidos;
}

// Pedidos simultâneos do mesmo documento compartilham um único download.
const emAndamento = new Map<string, Promise<Uint8Array | undefined>>();
export function obterPdf(id: number, url: URL, sinal?: AbortSignal): Promise<Uint8Array | undefined> {
  const chave = arquivoDoCache(id, url);
  const existente = emAndamento.get(chave); if (existente) return existente;
  // O download compartilhado não depende de quem pediu primeiro: o cancelamento de um visitante não derruba o dos outros.
  const andamento = baixarPdf(id, url).finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, andamento);
  return sinal ? Promise.race([andamento, new Promise<never>((_, rejeitar) => { if (sinal.aborted) rejeitar(sinal.reason); else sinal.addEventListener('abort', () => rejeitar(sinal.reason), { once: true }); })]) : andamento;
}
async function baixarPdf(id: number, url: URL): Promise<Uint8Array | undefined> {
  try { const arquivo = arquivoDoCache(id, url); const { mtimeMs } = await stat(arquivo); if (Date.now() - mtimeMs <= CACHE_VALIDADE_MS) { const salvo = await readFile(arquivo); if (ehPdf(salvo)) return salvo; } } catch { /* sem cópia */ }
  const resposta = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (!resposta.ok || !resposta.body) return undefined;
  if (!/application\/pdf/i.test(resposta.headers.get('content-type') ?? '')) return undefined;
  if (Number(resposta.headers.get('content-length') || 0) > LIMITE_PDF) return undefined;
  const partes: Uint8Array[] = []; let tamanho = 0;
  for await (const parte of resposta.body as unknown as AsyncIterable<Uint8Array>) { tamanho += parte.length; if (tamanho > LIMITE_PDF) return undefined; partes.push(parte); }
  const bytes = Buffer.concat(partes);
  if (!ehPdf(bytes)) return undefined;
  try { await mkdir(pasta(), { recursive: true }); const arquivo = arquivoDoCache(id, url); const temporario = `${arquivo}.${process.pid}.tmp`; await writeFile(temporario, bytes); await rename(temporario, arquivo); await podarCache(); } catch { /* cache opcional */ }
  return bytes;
}
