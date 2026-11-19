// Sem dependências: usado pela página do chat no navegador e pelos testes.
export type EventoDoChat =
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'done'; text: string; metricsRecorded?: boolean; restantes?: number }
  | { type: 'error'; error?: string };

/** Interpreta uma linha do fluxo NDJSON; linha vazia, truncada ou de tipo desconhecido devolve `undefined`. */
export function lerLinhaDoChat(linha: string): EventoDoChat | undefined {
  if (!linha.trim()) return undefined;
  try {
    const evento = JSON.parse(linha) as { type?: unknown; text?: unknown; error?: unknown; metricsRecorded?: unknown; restantes?: unknown };
    if (evento.type === 'delta' && typeof evento.text === 'string') return { type: 'delta', text: evento.text };
    if (evento.type === 'reset') return { type: 'reset' };
    if (evento.type === 'done' && typeof evento.text === 'string') return { type: 'done', text: evento.text, metricsRecorded: typeof evento.metricsRecorded === 'boolean' ? evento.metricsRecorded : undefined, restantes: typeof evento.restantes === 'number' ? evento.restantes : undefined };
    if (evento.type === 'error') return { type: 'error', error: typeof evento.error === 'string' ? evento.error : undefined };
  } catch { /* linha truncada: tratada pelo chamador como interrupção */ }
  return undefined;
}

/** Junta os pedaços do fluxo (que podem partir uma linha ou um caractere ao meio) e entrega os eventos completos. `invalidas` conta linhas não vazias que não puderam ser lidas. */
export class LeitorDoChat {
  private resto = ''; private decoder = new TextDecoder(); invalidas = 0;
  empurrar(pedaco: Uint8Array | undefined, fim = false): EventoDoChat[] {
    this.resto += pedaco ? this.decoder.decode(pedaco, { stream: !fim }) : fim ? this.decoder.decode() : '';
    const linhas = this.resto.split('\n'); this.resto = linhas.pop() ?? '';
    if (fim && this.resto.trim()) { linhas.push(this.resto); this.resto = ''; }
    const eventos: EventoDoChat[] = [];
    for (const linha of linhas) { if (!linha.trim()) continue; const e = lerLinhaDoChat(linha); if (e) eventos.push(e); else this.invalidas++; }
    return eventos;
  }
}

/** Texto simples de uma resposta em markdown, para leitores de tela: links viram só o rótulo e o realce some. */
export function textoParaLeitor(markdown: string) {
  return markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').replace(/\s*\n+\s*/g, ' ').trim();
}
