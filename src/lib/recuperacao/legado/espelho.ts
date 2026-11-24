import { SITE } from '@/lib/base/constantes';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EspelhoDoSite, Passagem } from '@/lib/base/tipos';
import { normalizar, termosDaConsulta } from '@/lib/base/texto';
import { supabaseRequest } from '@/lib/recuperacao/legado/supabase';

// Espelho do site (Supabase e cópia local em `.data/knowledge`): busca de reserva, só usada quando a coleta local em SQLite não existe. Fase 6 decide o destino.
export function fatiarTexto(content: string, size = 1200, overlap = 150): string[] {
  const result: string[] = [];
  for (let offset = 0; offset < content.length; offset += size - overlap) result.push(content.slice(offset, offset + size));
  return result;
}
export function buscarNoEspelho(snapshot: EspelhoDoSite, question: string, limit = 4): Passagem[] {
  const terms = termosDaConsulta(question);
  const contact = /address|location|endereco|localiza|sede|fica|telefone|phone|horario|hours|contato/.test(normalizar(question));
  const news = /news|latest|recent|noticia|novidade/.test(normalizar(question));
  const candidates = snapshot.documents.filter(d => d.status === 'active').flatMap(d => fatiarTexto(d.content).map((content, index) => {
    const text = normalizar(content); const title = normalizar(d.title);
    const matches = terms.filter(t => text.includes(t) || title.includes(t));
    const noise = /\/noticias\/(page\/|categories\/)/.test(d.url) ? 0.2 : 1;
    const score = noise * matches.length + terms.filter(t => title.includes(t)).length * 2 +
      (contact && d.url === `${SITE}/contato` ? 8 : 0) + (news && d.publishedAt && index === 0 ? 2 : 0);
    return { url: d.url, title: d.title, content, fetchedAt: d.fetchedAt, score, date: d.publishedAt || '' };
  }));
  candidates.sort((a, b) => news ? b.date.localeCompare(a.date) || b.score - a.score : b.score - a.score);
  const result: Passagem[] = []; const counts = new Map<string, number>();
  for (const passage of candidates) {
    if (passage.score <= 0 || (counts.get(passage.url) || 0) >= 2) continue;
    result.push(passage); counts.set(passage.url, (counts.get(passage.url) || 0) + 1);
    if (result.length === limit) break;
  }
  return result;
}

const noisePage = (url: string) => /\/noticias\/(page\/|categories\/)/.test(url);
/** Busca no espelho do site (Supabase ou cópia local), com prazo próprio. Só é usada quando a coleta local em SQLite não existe. */
export async function espelhoDoSite(question: string): Promise<Passagem[]> {
  const buscaGeral = async (): Promise<Passagem[]> => {
    if (process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY)) {
      try {
        const rows = await supabaseRequest('rpc/search_sindi_knowledge', { terms: termosDaConsulta(question), result_limit: 8, question: normalizar(question) });
        if (!Array.isArray(rows)) throw new Error('Invalid knowledge response');
        return rows.map(r => ({ url: r.url, title: r.title, content: r.content, fetchedAt: r.fetched_at }));
      } catch { return buscaLocal(question); }
    }
    return buscaLocal(question);
  };
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const passages = await Promise.race([buscaGeral(), new Promise<Passagem[]>(resolve => { temporizador = setTimeout(() => resolve([]), 3200); })]);
  if (temporizador) clearTimeout(temporizador);
  const asksNews = /news|latest|recent|noticia|novidade/.test(normalizar(question));
  // Listing and pagination pages only add noise unless the user asks for news.
  return asksNews ? passages : passages.filter(p => !noisePage(p.url));
}
async function buscaLocal(question: string): Promise<Passagem[]> {
  try {
    const snapshot: EspelhoDoSite = JSON.parse(await readFile(path.join(process.cwd(), '.data/knowledge/current.json'), 'utf8'));
    return buscarNoEspelho(snapshot, question, 8);
  } catch { return []; }
}
