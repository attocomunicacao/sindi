/**
 * Proteções comuns das rotas da API, para que uma ferramenta nova as receba sem copiar código:
 *  - POST: origem permitida (403) → tipo de conteúdo (415) → limite por minuto (429) → corpo com tamanho máximo (413) e JSON válido (400);
 *  - GET: só o limite por minuto;
 *  - respostas de erro sempre em JSON `{ error }`, sem cache; PDFs com os mesmos cabeçalhos.
 * A validação do conteúdo (zod) e a regra da ferramenta continuam na rota.
 */
import { allowedChatOrigin } from '@/lib/origin';
import { limitarPorMinuto } from '@/lib/limite';

export const erroJson = (mensagem: string, status: number, extra: Record<string, unknown> = {}, cabecalhos: Record<string, string> = {}) =>
  Response.json({ error: mensagem, ...extra }, { status, headers: { 'Cache-Control': 'no-store', ...cabecalhos } });

/** A origem do navegador tem de ser a do próprio servidor ou a origem pública configurada (SINDI_PUBLIC_ORIGIN, atrás de um repasse). */
export function origemPermitida(request: Request) {
  const host = request.headers.get('host') || new URL(request.url).host;
  return allowedChatOrigin(request.headers.get('origin'), host, process.env.SINDI_PUBLIC_ORIGIN, Boolean(process.env.VERCEL));
}

export const limiteExcedido = (reiniciaEmSegundos: number) => erroJson('Muitos pedidos em pouco tempo. Tente novamente em instantes.', 429, {}, { 'Retry-After': String(reiniciaEmSegundos) });

/** GET e outras leituras: devolve a resposta 429 se o visitante passou do limite por minuto; `undefined` se pode seguir. */
export function guardaDeLeitura(request: Request, nome: string, limitePorMinuto: number): Response | undefined {
  const limite = limitarPorMinuto(request, nome, limitePorMinuto);
  return limite.ok ? undefined : limiteExcedido(limite.reiniciaEmSegundos);
}

export type OpcoesDeEscrita = {
  /** Nome do limite (um por rota). */
  nome: string; limiteBytes: number;
  /** Pedidos por minuto por visitante; sem valor, não há limite por minuto (ex.: o chat, que tem a cota de mensagens). */
  limitePorMinuto?: number;
  /** `json` (padrão): exige corpo JSON. `opcional`: o corpo pode faltar; se vier, tem de ser JSON válido. */
  corpo?: 'json' | 'opcional';
  textos?: { grande?: string; invalido?: string };
};

/** Lê o corpo até `limiteBytes` e interpreta o JSON; `undefined` se não houver corpo. */
export async function lerJsonLimitado(request: Request, limiteBytes: number, textos: OpcoesDeEscrita['textos'] = {}): Promise<{ json: unknown } | { resposta: Response }> {
  const invalido = textos.invalido ?? 'Requisição inválida.';
  const leitor = request.body?.getReader();
  if (!leitor) return { json: undefined };
  try {
    let tamanho = 0; const partes: Uint8Array[] = [];
    while (true) {
      const { value, done } = await leitor.read(); if (done) break;
      tamanho += value.length;
      if (tamanho > limiteBytes) { await leitor.cancel(); return { resposta: erroJson(textos.grande ?? 'Requisição grande demais.', 413) }; }
      partes.push(value);
    }
    if (!tamanho) return { json: undefined };
    return { json: JSON.parse(Buffer.concat(partes).toString('utf8')) };
  } catch { return { resposta: erroJson(invalido, 400) }; }
}

export async function guardaDeEscrita(request: Request, o: OpcoesDeEscrita): Promise<{ json: unknown } | { resposta: Response }> {
  if (!origemPermitida(request)) return { resposta: erroJson('Origem não permitida.', 403) };
  const ehJson = request.headers.get('content-type')?.includes('application/json') === true;
  if ((o.corpo ?? 'json') === 'json' && !ehJson) return { resposta: erroJson('Formato inválido.', 415) };
  if (o.limitePorMinuto) { const limite = limitarPorMinuto(request, o.nome, o.limitePorMinuto); if (!limite.ok) return { resposta: limiteExcedido(limite.reiniciaEmSegundos) }; }
  // Corpo opcional sem tipo JSON: não é lido (nem tem como ser interpretado).
  if (o.corpo === 'opcional' && !ehJson) return { json: undefined };
  const lido = await lerJsonLimitado(request, o.limiteBytes, o.textos);
  if ('resposta' in lido) return lido;
  if ((o.corpo ?? 'json') === 'json' && lido.json === undefined) return { resposta: erroJson(o.textos?.invalido ?? 'Requisição inválida.', 400) };
  return lido;
}

/** PDF para download (padrão) ou para abrir na página (`inline`). Sem cache, salvo quando a rota indicar. */
export function respostaPdf(bytes: Uint8Array, arquivo: string, opcoes: { inline?: boolean; cache?: string; extras?: Record<string, string> } = {}) {
  return new Response(Buffer.from(bytes), { headers: {
    'Content-Type': 'application/pdf', 'Content-Disposition': `${opcoes.inline ? 'inline' : 'attachment'}; filename="${arquivo}"`, 'Content-Length': String(bytes.length),
    'Cache-Control': opcoes.cache ?? 'no-store', 'X-Content-Type-Options': 'nosniff', ...opcoes.extras,
  } });
}
