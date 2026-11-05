import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HOSTS = new Set(['sindeprestem.com.br', 'www.sindeprestem.com.br']);
export const LIMITE_PDF = 80 * 1024 * 1024;

/** Só PDFs do domínio do SINDEPRESTEM, por https e sem credenciais ou porta; qualquer outra origem nunca passa pelo servidor. */
export function pdfPermitido(valor: string): URL | undefined {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && HOSTS.has(url.hostname) && !url.username && !url.password && !url.port && /\.pdf$/i.test(url.pathname) ? url : undefined;
  } catch { return undefined; }
}

const pasta = () => path.join(process.cwd(), '.data', 'pdf-cache');
const arquivoDoCache = (id: number) => path.join(pasta(), `${id}.pdf`);
const ehPdf = (bytes: Uint8Array) => bytes.length > 5 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';

/** Entrega o PDF: cópia em disco se houver; senão baixa da origem, confere tipo, tamanho e assinatura %PDF- e guarda a cópia (falha de gravação não impede a leitura). */
export async function obterPdf(id: number, url: URL, sinal?: AbortSignal): Promise<Uint8Array | undefined> {
  try { const salvo = await readFile(arquivoDoCache(id)); if (ehPdf(salvo)) return salvo; } catch { /* sem cópia */ }
  const resposta = await fetch(url, { redirect: 'error', signal: AbortSignal.any([...(sinal ? [sinal] : []), AbortSignal.timeout(60000)]) });
  if (!resposta.ok || !resposta.body) return undefined;
  if (!/application\/pdf/i.test(resposta.headers.get('content-type') ?? '')) return undefined;
  if (Number(resposta.headers.get('content-length') || 0) > LIMITE_PDF) return undefined;
  const partes: Uint8Array[] = []; let tamanho = 0;
  for await (const parte of resposta.body as unknown as AsyncIterable<Uint8Array>) { tamanho += parte.length; if (tamanho > LIMITE_PDF) return undefined; partes.push(parte); }
  const bytes = Buffer.concat(partes);
  if (!ehPdf(bytes)) return undefined;
  try { await mkdir(pasta(), { recursive: true }); const temporario = `${arquivoDoCache(id)}.${process.pid}.tmp`; await writeFile(temporario, bytes); await rename(temporario, arquivoDoCache(id)); } catch { /* cache opcional */ }
  return bytes;
}
