import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { urlDeDocumentoValida } from '@/lib/dados/url-documento';

export type DocumentoColetado = { source: string; url: string; title: string; content: string; publishedAt?: string; meta?: Record<string, unknown> };
export type IndicadorColetado = { id: string; source: string; group: string; label: string; value: number; unit: string; period: string; previous?: number; url: string };

export const pastaDosDados = () => path.resolve(/*turbopackIgnore: true*/ process.env.SINDI_DATA_DIR || '.data/dados');
export const caminhoDoBanco = () => path.join(pastaDosDados(), 'sindi-dados.sqlite');

export function abrirBanco(arquivo = caminhoDoBanco()) {
  if (arquivo !== ':memory:') mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS documents (url TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, hash TEXT NOT NULL,
      published_at TEXT, fetched_at TEXT NOT NULL, changed_at TEXT NOT NULL, meta TEXT);
    CREATE INDEX IF NOT EXISTS documents_source ON documents(source, published_at DESC);
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, content, content='documents', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN INSERT INTO documents_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content); END;
    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content); END;
    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content); INSERT INTO documents_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content); END;
    CREATE TABLE IF NOT EXISTS indicators (id TEXT PRIMARY KEY, source TEXT NOT NULL, grp TEXT NOT NULL, label TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
      period TEXT NOT NULL, previous REAL, url TEXT NOT NULL, fetched_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS series (id TEXT NOT NULL, period TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY (id, period));
    CREATE TABLE IF NOT EXISTS queue (url TEXT PRIMARY KEY, source TEXT NOT NULL, added_at TEXT NOT NULL, fetched_at TEXT);
    CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,
      fetched INTEGER NOT NULL DEFAULT 0, changed INTEGER NOT NULL DEFAULT 0, error TEXT);`);
  return db;
}
export type BancoDeDados = ReturnType<typeof abrirBanco>;

/**
 * Abre o banco só para leitura, roda `fn` e fecha. Sem o arquivo, ou se abrir ou ler falhar, devolve `vazio`: quem consulta o banco no chat nunca derruba a pergunta,
 * que segue sem aquela fonte.
 */
export function comBancoSomenteLeitura<T>(arquivo: string, fn: (db: DatabaseSync) => T, vazio: T): T {
  if (!existsSync(arquivo)) return vazio;
  let db: DatabaseSync;
  try { db = new DatabaseSync(arquivo, { readOnly: true }); } catch { return vazio; }
  try { return fn(db); } catch { return vazio; } finally { db.close(); }
}
/** Consulta FTS5 por prefixo de cada palavra (as palavras já vêm limpas, sem aspas nem operadores), unidas por `operador`. */
export const consultaPorPrefixos = (palavras: string[], operador: 'AND' | 'OR' = 'OR') => palavras.map(w => `"${w}"*`).join(` ${operador} `);

const hashDe = (texto: string) => createHash('sha256').update(texto).digest('hex');

/** Insere ou atualiza; devolve true somente quando o texto mudou (ou é novo). */
export function gravarDocumento(db: BancoDeDados, documento: DocumentoColetado, agora = new Date().toISOString()): boolean {
  // O endereço vem, às vezes, de APIs externas e depois vira link na biblioteca e no chat: só http, https e ftp, sem credenciais.
  if (!urlDeDocumentoValida(documento.url)) return false;
  const hash = hashDe(documento.title + '\n' + documento.content);
  const linha = db.prepare('SELECT hash FROM documents WHERE url = ?').get(documento.url) as { hash: string } | undefined;
  const meta = documento.meta ? JSON.stringify(documento.meta) : null;
  if (!linha) {
    db.prepare('INSERT INTO documents (url, source, title, content, hash, published_at, fetched_at, changed_at, meta) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(documento.url, documento.source, documento.title, documento.content, hash, documento.publishedAt ?? null, agora, agora, meta);
    return true;
  }
  if (linha.hash === hash) { db.prepare('UPDATE documents SET fetched_at = ?, meta = COALESCE(?, meta) WHERE url = ?').run(agora, meta, documento.url); return false; }
  db.prepare('UPDATE documents SET title=?, content=?, hash=?, published_at=COALESCE(?, published_at), fetched_at=?, changed_at=?, meta=? WHERE url=?')
    .run(documento.title, documento.content, hash, documento.publishedAt ?? null, agora, agora, meta, documento.url);
  return true;
}
/** Remove documentos de uma fonte sob um prefixo de URL que não constam mais no texto atual (artigos renumerados ou revogados). */
export function apagarAusentes(db: BancoDeDados, fonte: string, prefixo: string, manter: Set<string>) {
  const linhas = db.prepare('SELECT url FROM documents WHERE source = ? AND substr(url, 1, ?) = ?').all(fonte, prefixo.length, prefixo) as { url: string }[];
  let removidos = 0;
  for (const { url } of linhas) if (!manter.has(url)) { db.prepare('DELETE FROM documents WHERE url = ?').run(url); removidos++; }
  return removidos;
}
export function temDocumento(db: BancoDeDados, url: string) { return Boolean(db.prepare('SELECT 1 FROM documents WHERE url = ?').get(url)); }

export function gravarIndicador(db: BancoDeDados, indicador: IndicadorColetado, agora = new Date().toISOString()) {
  db.prepare(`INSERT INTO indicators (id, source, grp, label, value, unit, period, previous, url, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET source=excluded.source, grp=excluded.grp, label=excluded.label, value=excluded.value, unit=excluded.unit, period=excluded.period, previous=excluded.previous, url=excluded.url, fetched_at=excluded.fetched_at`)
    .run(indicador.id, indicador.source, indicador.group, indicador.label, indicador.value, indicador.unit, indicador.period, indicador.previous ?? null, indicador.url, agora);
}

/** Estado simples por chave (ETag, última verificação, tamanho de arquivo remoto...). */
export function lerEstado(db: BancoDeDados, chave: string) {
  return (db.prepare('SELECT value, updated_at AS updatedAt FROM state WHERE key = ?').get(chave) as { value: string; updatedAt: string } | undefined);
}
export function gravarEstado(db: BancoDeDados, chave: string, valor: string, agora = new Date().toISOString()) {
  db.prepare('INSERT INTO state (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(chave, valor, agora);
}
/** Verdadeiro quando a chave nunca foi verificada ou a última verificação passou do intervalo (ou na coleta completa). */
export function vencido(db: BancoDeDados, chave: string, aCadaMs: number, completa = false, agora = Date.now()) {
  const estado = lerEstado(db, chave);
  return completa || !estado || agora - Date.parse(estado.updatedAt) >= aCadaMs;
}
export function gravarSerie(db: BancoDeDados, id: string, period: string, valor: number) {
  db.prepare('INSERT INTO series (id, period, value) VALUES (?,?,?) ON CONFLICT(id, period) DO UPDATE SET value=excluded.value').run(id, period, valor);
}
export function lerSerie(db: BancoDeDados, id: string) {
  return (db.prepare('SELECT period, value FROM series WHERE id = ? ORDER BY period').all(id) as { period: string; value: number }[]).map(r => ({ period: r.period, value: r.value }));
}
/** Fila de URLs descobertas (rastreamento gradual de um portal): novas primeiro, depois as mais antigas para revisão. */
export function enfileirar(db: BancoDeDados, fonte: string, enderecos: string[], agora = new Date().toISOString()) {
  const inserir = db.prepare('INSERT OR IGNORE INTO queue (url, source, added_at) VALUES (?,?,?)');
  for (const url of enderecos) inserir.run(url, fonte, agora);
}
export function proximosDaFila(db: BancoDeDados, fonte: string, limite: number, obsoletoAntes: string) {
  return (db.prepare(`SELECT url FROM queue WHERE source = ? AND (fetched_at IS NULL OR fetched_at < ?) ORDER BY fetched_at IS NOT NULL, fetched_at LIMIT ?`).all(fonte, obsoletoAntes, limite) as { url: string }[]).map(r => r.url);
}
export function marcarBuscado(db: BancoDeDados, url: string, agora = new Date().toISOString()) { db.prepare('UPDATE queue SET fetched_at = ? WHERE url = ?').run(agora, url); }

export function iniciarExecucao(db: BancoDeDados, fonte: string) {
  return Number(db.prepare('INSERT INTO runs (source, started_at, status) VALUES (?,?,?)').run(fonte, new Date().toISOString(), 'running').lastInsertRowid);
}
export function finalizarExecucao(db: BancoDeDados, id: number, resultado: { fetched: number; changed: number; error?: string }) {
  db.prepare('UPDATE runs SET finished_at=?, status=?, fetched=?, changed=?, error=? WHERE id=?')
    .run(new Date().toISOString(), resultado.error ? 'error' : 'ok', resultado.fetched, resultado.changed, resultado.error?.slice(0, 300) ?? null, id);
}

/** Execuções que ficaram "running" porque o processo caiu ou foi encerrado: só existe um escritor por vez, então no início de uma coleta nenhuma delas pode estar de fato rodando. */
export function abandonarExecucoes(db: BancoDeDados, agora = new Date().toISOString()) {
  return Number(db.prepare("UPDATE runs SET finished_at = ?, status = 'error', error = 'interrompida (o processo foi encerrado)' WHERE status = 'running'").run(agora).changes);
}
/** Mantém o histórico das execuções por `dias` dias, preservando sempre as `minimo` mais recentes de cada fonte (para o painel saber a última coleta ok). */
export function podarExecucoes(db: BancoDeDados, dias = 90, minimo = 50, agora = Date.now()) {
  const limite = new Date(agora - dias * 86_400_000).toISOString();
  return Number(db.prepare(`DELETE FROM runs WHERE started_at < ? AND id NOT IN (
    SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY source ORDER BY id DESC) AS n FROM runs) WHERE n <= ?
    UNION SELECT MAX(id) FROM runs WHERE status = 'ok' GROUP BY source)`).run(limite, minimo).changes);
}
/** Quantas execuções seguidas da fonte terminaram em erro, da mais recente para trás (0 se a última foi ok). */
export function falhasSeguidas(db: BancoDeDados, fonte: string, olhar = 20) {
  const ultimas = db.prepare("SELECT status FROM runs WHERE source = ? AND status != 'running' ORDER BY id DESC LIMIT ?").all(fonte, olhar) as { status: string }[];
  const primeiraOk = ultimas.findIndex(r => r.status === 'ok');
  return primeiraOk === -1 ? ultimas.length : primeiraOk;
}

/** Busca de texto integral (BM25) nas fontes externas, usada pelo chat para citar dados oficiais. */
export function buscarDocumentos(db: BancoDeDados, termos: string[], limite = 3, fontes?: string[], maxCaracteres = 1500) {
  const palavras = termos.map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(t => t.length >= 3);
  if (!palavras.length) return [];
  const consulta = consultaPorPrefixos(palavras);
  const filtroDeFontes = fontes?.length ? `AND d.source IN (${fontes.map(() => '?').join(',')})` : '';
  return db.prepare(`SELECT d.url, d.source, d.title, substr(d.content, 1, ${maxCaracteres}) AS content, d.fetched_at AS fetchedAt FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
    WHERE documents_fts MATCH ? ${filtroDeFontes} ORDER BY bm25(documents_fts, 4.0, 1.0) LIMIT ?`).all(consulta, ...(fontes ?? []), limite) as { url: string; source: string; title: string; content: string; fetchedAt: string }[];
}
