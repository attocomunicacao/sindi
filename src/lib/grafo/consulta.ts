import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { limpar, refDoDocumento } from '@/lib/biblioteca/consulta';
import { pastaDosDados, caminhoDoBanco } from '@/lib/dados/db';
import type { Passagem } from '@/lib/base/tipos';
import { extrairEntidades } from '@/lib/grafo/entidades';
import type { Grafo, No } from '@/lib/grafo/tipos';

/**
 * O grafo alimentando o chat. Quando a pergunta cita uma lei, NR ou projeto de lei (por número), a busca recebe também os documentos que o grafo liga a essa
 * entidade — notícias, artigos, cartilhas e o próprio projeto — mesmo que as palavras da pergunta não estejam no título deles. Esses trechos entram como
 * **candidatos**: quem decide se vão ao modelo é a mesma régua de cobertura da busca (src/lib/recuperacao/recuperar.ts), e a verificação de fatos continua valendo.
 */
export const arquivoDoGrafo = () => path.join(pastaDosDados(), 'grafo.json');

let cache: { mtime: number; grafo: Grafo; verificadoEm: number; vizinhos: Map<string, string[]> } | undefined;
/** O grafo em memória, relido quando o arquivo muda (conferência a cada 5 s). `undefined` se ainda não foi gerado (`npm run grafo:gerar`). */
export function grafoEmMemoria(): Grafo | undefined {
  if (cache && Date.now() - cache.verificadoEm < 5000) return cache.grafo;
  try {
    const mtime = statSync(arquivoDoGrafo()).mtimeMs;
    if (cache && cache.mtime === mtime) {
      cache.verificadoEm = Date.now();
      return cache.grafo;
    }
    const grafo = JSON.parse(readFileSync(arquivoDoGrafo(), 'utf8')) as Grafo;
    if (grafo.versao !== 1 || !Array.isArray(grafo.nos) || !Array.isArray(grafo.arestas))
      throw new Error('grafo inválido');
    const vizinhos = new Map<string, string[]>();
    for (const a of grafo.arestas) {
      (vizinhos.get(a.de) ?? vizinhos.set(a.de, []).get(a.de)!).push(a.para);
      (vizinhos.get(a.para) ?? vizinhos.set(a.para, []).get(a.para)!).push(a.de);
    }
    cache = { mtime, grafo, verificadoEm: Date.now(), vizinhos };
    return grafo;
  } catch {
    cache = undefined;
    return undefined;
  }
}
export function esquecerGrafo() {
  cache = undefined;
}

/** Documentos ligados às entidades citadas na pergunta: o próprio projeto primeiro, depois os mais recentes. */
export function documentosDasEntidades(pergunta: string, limite = 4): No[] {
  const grafo = grafoEmMemoria();
  if (!grafo || !cache) return [];
  const porId = new Map(grafo.nos.map((n) => [n.id, n]));
  const escolhidos: No[] = [];
  const vistos = new Set<string>();
  for (const e of extrairEntidades(pergunta, 4)) {
    const docs = (cache.vizinhos.get(`ent:${e.id}`) ?? [])
      .map((id) => porId.get(id))
      .filter((n): n is No => n?.tipo === 'documento');
    docs.sort(
      (a, b) =>
        (b.grupo === 'camara' || b.grupo === 'senado' ? 1 : 0) -
          (a.grupo === 'camara' || a.grupo === 'senado' ? 1 : 0) || (b.data ?? '').localeCompare(a.data ?? ''),
    );
    for (const d of docs.slice(0, 3))
      if (!vistos.has(d.id) && escolhidos.length < limite) {
        vistos.add(d.id);
        escolhidos.push(d);
      }
  }
  return escolhidos;
}

/** Trecho de cada documento ligado, em volta da primeira menção à entidade (o modelo lê pouco: até 1.200 caracteres por fonte). */
export function documentosPeloGrafo(pergunta: string, limite = 4): Passagem[] {
  const nos = documentosDasEntidades(pergunta, limite);
  if (!nos.length || !existsSync(caminhoDoBanco())) return [];
  const entidades = extrairEntidades(pergunta, 4);
  const db = new DatabaseSync(caminhoDoBanco(), { readOnly: true });
  try {
    const consulta = db.prepare('SELECT url, title, content, published_at, fetched_at FROM documents WHERE rowid = ?');
    return nos.flatMap((n) => {
      const rowid = Number(n.id.split(':').at(-1));
      const ref = n.id.split(':')[1];
      const linha = consulta.get(rowid) as
        { url: string; title: string; content: string; published_at: string | null; fetched_at: string } | undefined;
      // O banco foi refeito depois do grafo (o rowid aponta para outro documento): ignora até a próxima geração.
      if (!linha || refDoDocumento(linha.url) !== ref) return [];
      const texto = limpar(linha.content);
      const numero = entidades
        .map((e) => e.rotulo.match(/\d[\d.]*\/\d{4}|\d+/)?.[0])
        .find(Boolean)
        ?.replace(/\./g, '');
      const posicao = numero ? texto.replace(/(\d)\.(\d{3})/g, '$1$2').indexOf(numero) : -1;
      const inicio = Math.max(0, (posicao >= 0 ? posicao : 0) - 300);
      return [
        {
          url: linha.url.split('#')[0],
          title: linha.title,
          content: texto.slice(inicio, inicio + 1200),
          fetchedAt: linha.published_at ?? linha.fetched_at,
        } satisfies Passagem,
      ];
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}
