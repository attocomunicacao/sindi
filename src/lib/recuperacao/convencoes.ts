import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { SITE } from '@/lib/base/constantes';
import type { PassagemFixa, TrechosDeDocumentos } from '@/lib/base/tipos';
import { normalizar } from '@/lib/base/texto';
import { dbPath } from '@/lib/dados/db';
import { CATEGORIAS_DE_CONVENCAO } from '@/lib/recuperacao/intencao';
import { PALAVRAS_VAZIAS_DA_PERGUNTA } from '@/lib/recuperacao/termos-de-documento';

const SYNONYMS: Record<string, string[]> = { piso: ['piso salarial', 'salario normativo', 'salario base', 'salarios'], reajuste: ['reajuste', 'correcao salarial', 'data-base', 'data base'], vale: ['vale refeicao', 'vale alimentacao', 'tickets', 'cesta basica'] };
const NL = String.fromCharCode(10);
/**
 * Pergunta sobre o conteúdo de uma cláusula: devolve trechos do texto da convenção mais recente da categoria citada, com link, para o modelo
 * explicar. Sem trecho aplicável, devolve `semResposta`; o modelo não responde valores de convenção de memória.
 */
export function trechosDeClausula(question: string, file = dbPath()): TrechosDeDocumentos {
  const q = normalizar(question);
  const wanted = CATEGORIAS_DE_CONVENCAO.find(([test]) => test.test(q))?.[1]; const anos = [...q.matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1])); const year = anos.length ? Math.max(...anos) : undefined;
  const terms = [...new Set((q.match(/[a-z0-9]{4,}/g) ?? []).filter(w => !PALAVRAS_VAZIAS_DA_PERGUNTA.has(w) && !/^\d{4}$/.test(w)))].slice(0, 8);
  const phrases = [...new Set(terms.flatMap(t => SYNONYMS[t] ?? []))]; const chaves = terms.filter(t => SYNONYMS[t]);
  // Sem categoria citada, o cargo ou assunto da pergunta (ex.: "técnico de segurança") precisa aparecer no trecho; só "piso" não basta, senão a cláusula de outra categoria seria devolvida.
  const cargo = wanted ? [] : terms.filter(t => !SYNONYMS[t] && !/^(valor|valores|trabalho|quanto|minimo|maximo|vigente|atual)$/.test(t));
  if (!existsSync(file)) return { passages: [] };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const docs = db.prepare(`SELECT title, url, content, fetched_at AS fetchedAt, json_extract(meta, '$.category') AS category, json_extract(meta, '$.year') AS year, json_extract(meta, '$.type') AS type FROM documents
      WHERE source = 'sindeprestem' AND json_extract(meta, '$.section') = 'convencao' AND url LIKE '%.pdf' AND length(content) > 2000`).all() as { title: string; url: string; content: string; fetchedAt: string; category: string | null; year: number | null; type: string | null }[];
    const pool = docs.filter(d => (!wanted || d.category === wanted) && (!anos.length || anos.includes(d.year ?? 0)) && !/jundia/i.test(d.title));
    const latest = Math.max(0, ...pool.map(d => d.year ?? 0));
    const candidates = pool.filter(d => d.type === 'Convenção coletiva' && (d.year ?? 0) >= (year ?? latest)).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 2);
    if (!candidates.length) return { passages: [], semResposta: `Não encontrei a convenção dessa categoria e ano. Veja [Documentos coletivos](${SITE}/convencoes-coletivas).` };
    const passages: PassagemFixa[] = [];
    for (const doc of candidates) {
      const all = doc.content.split(NL); const wins: { score: number; at: number }[] = [];
      for (let i = 0; i < all.length; i += 4) {
        const window = normalizar(all.slice(i, i + 10).join(' '));
        // A palavra-chave da cláusula (piso, reajuste, vale) ou seus sinônimos decidem o trecho; os demais termos apenas desempatam.
        const chaveNaJanela = chaves.length > 0 && (chaves.some(t => window.includes(t)) || phrases.some(p => window.includes(p))) && (!cargo.length || cargo.some(t => window.includes(t)));
        const score = (chaveNaJanela ? 6 : 0) + terms.filter(t => !SYNONYMS[t] && window.includes(t)).length;
        if (chaves.length ? chaveNaJanela : score >= Math.min(4, terms.length * 2 || 2)) wins.push({ score, at: i });
      }
      // Os dois melhores trechos que não se sobrepõem (janelas de 14 linhas).
      const best: { score: number; at: number }[] = [];
      for (const w of wins.sort((a, b) => b.score - a.score)) if (best.length < 2 && best.every(b => Math.abs(b.at - w.at) >= 14)) best.push(w);
      best.sort((a, b) => a.at - b.at);
      // O trecho começa na primeira linha da janela que contém algum termo da pergunta.
      const excerpts = best.map(w => { const first = all.slice(w.at, w.at + 10).findIndex(l => terms.some(t => normalizar(l).includes(t))); const from = w.at + Math.max(0, first); return all.slice(from, from + 14).join(' ').replace(/\s+/g, ' ').trim().slice(0, 750); });
      if (excerpts.length) passages.push({ url: doc.url, title: doc.title, content: excerpts.join(' […] '), fetchedAt: doc.fetchedAt, pinned: true });
    }
    if (!passages.length) return { passages: [], semResposta: `Não consegui confirmar isso nas convenções coletadas${cargo.length ? ' (não identifiquei a categoria ou o cargo)' : ''}. Veja [Documentos coletivos](${SITE}/convencoes-coletivas) ou fale com o Setor Jurídico do SINDEPRESTEM: (11) 3215-8250.` };
    return { passages };
  } catch { return { passages: [] }; } finally { db.close(); }
}
