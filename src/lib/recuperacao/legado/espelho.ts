import { URL_CONTATO } from '@/lib/base/constantes';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EspelhoDoSite, Passagem } from '@/lib/base/tipos';
import { normalizar, termosDaConsulta } from '@/lib/base/texto';
import { requisitarSupabase } from '@/lib/recuperacao/legado/supabase';

// Espelho do site (Supabase e cópia local em `.data/knowledge`): busca de reserva, só usada quando a coleta local em SQLite não existe. Fase 6 decide o destino.
export function fatiarTexto(conteudo: string, tamanho = 1200, sobreposicao = 150): string[] {
  const resultado: string[] = [];
  for (let deslocamento = 0; deslocamento < conteudo.length; deslocamento += tamanho - sobreposicao) resultado.push(conteudo.slice(deslocamento, deslocamento + tamanho));
  return resultado;
}
export function buscarNoEspelho(espelho: EspelhoDoSite, pergunta: string, limite = 4): Passagem[] {
  const termos = termosDaConsulta(pergunta);
  const contato = /address|location|endereco|localiza|sede|fica|telefone|phone|horario|hours|contato/.test(normalizar(pergunta));
  const noticias = /news|latest|recent|noticia|novidade/.test(normalizar(pergunta));
  const candidatas = espelho.documents.filter(d => d.status === 'active').flatMap(d => fatiarTexto(d.content).map((conteudo, indice) => {
    const texto = normalizar(conteudo); const titulo = normalizar(d.title);
    const acertos = termos.filter(t => texto.includes(t) || titulo.includes(t));
    const ruido = /\/noticias\/(page\/|categories\/)/.test(d.url) ? 0.2 : 1;
    const score = ruido * acertos.length + termos.filter(t => titulo.includes(t)).length * 2 +
      (contato && d.url === URL_CONTATO ? 8 : 0) + (noticias && d.publishedAt && indice === 0 ? 2 : 0);
    return { url: d.url, title: d.title, content: conteudo, fetchedAt: d.fetchedAt, score, date: d.publishedAt || '' };
  }));
  candidatas.sort((a, b) => noticias ? b.date.localeCompare(a.date) || b.score - a.score : b.score - a.score);
  const resultado: Passagem[] = []; const contagens = new Map<string, number>();
  for (const passagem of candidatas) {
    if (passagem.score <= 0 || (contagens.get(passagem.url) || 0) >= 2) continue;
    resultado.push(passagem); contagens.set(passagem.url, (contagens.get(passagem.url) || 0) + 1);
    if (resultado.length === limite) break;
  }
  return resultado;
}

const paginaDeRuido = (url: string) => /\/noticias\/(page\/|categories\/)/.test(url);
/** Busca no espelho do site (Supabase ou cópia local), com prazo próprio. Só é usada quando a coleta local em SQLite não existe. */
export async function espelhoDoSite(pergunta: string): Promise<Passagem[]> {
  const buscaGeral = async (): Promise<Passagem[]> => {
    if (process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY)) {
      try {
        const linhas = await requisitarSupabase('rpc/search_sindi_knowledge', { terms: termosDaConsulta(pergunta), result_limit: 8, question: normalizar(pergunta) });
        if (!Array.isArray(linhas)) throw new Error('Invalid knowledge response');
        return linhas.map(r => ({ url: r.url, title: r.title, content: r.content, fetchedAt: r.fetched_at }));
      } catch { return buscaLocal(pergunta); }
    }
    return buscaLocal(pergunta);
  };
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const passagens = await Promise.race([buscaGeral(), new Promise<Passagem[]>(resolve => { temporizador = setTimeout(() => resolve([]), 3200); })]);
  if (temporizador) clearTimeout(temporizador);
  const pedeNoticias = /news|latest|recent|noticia|novidade/.test(normalizar(pergunta));
  // Páginas de listagem e de paginação só atrapalham, a menos que o usuário peça notícias.
  return pedeNoticias ? passagens : passagens.filter(p => !paginaDeRuido(p.url));
}
async function buscaLocal(pergunta: string): Promise<Passagem[]> {
  try {
    const espelho: EspelhoDoSite = JSON.parse(await readFile(path.join(process.cwd(), '.data/knowledge/current.json'), 'utf8'));
    return buscarNoEspelho(espelho, pergunta, 8);
  } catch { return []; }
}
