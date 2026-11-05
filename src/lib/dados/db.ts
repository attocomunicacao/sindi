import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type Doc = { source: string; url: string; title: string; content: string; publishedAt?: string; meta?: Record<string, unknown> };
export type Indicator = { id: string; source: string; group: string; label: string; value: number; unit: string; period: string; previous?: number; url: string };

export const dataDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.SINDI_DATA_DIR || '.data/dados');
export const dbPath = () => path.join(dataDir(), 'sindi-dados.sqlite');

export function openDb(file = dbPath()) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
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
export type Db = ReturnType<typeof openDb>;

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Insere ou atualiza; devolve true somente quando o texto mudou (ou é novo). */
export function upsertDocument(db: Db, doc: Doc, now = new Date().toISOString()): boolean {
  const hash = sha(doc.title + '\n' + doc.content);
  const row = db.prepare('SELECT hash FROM documents WHERE url = ?').get(doc.url) as { hash: string } | undefined;
  const meta = doc.meta ? JSON.stringify(doc.meta) : null;
  if (!row) {
    db.prepare('INSERT INTO documents (url, source, title, content, hash, published_at, fetched_at, changed_at, meta) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(doc.url, doc.source, doc.title, doc.content, hash, doc.publishedAt ?? null, now, now, meta);
    return true;
  }
  if (row.hash === hash) { db.prepare('UPDATE documents SET fetched_at = ?, meta = COALESCE(?, meta) WHERE url = ?').run(now, meta, doc.url); return false; }
  db.prepare('UPDATE documents SET title=?, content=?, hash=?, published_at=COALESCE(?, published_at), fetched_at=?, changed_at=?, meta=? WHERE url=?')
    .run(doc.title, doc.content, hash, doc.publishedAt ?? null, now, now, meta, doc.url);
  return true;
}
/** Remove documentos de uma fonte sob um prefixo de URL que não constam mais no texto atual (artigos renumerados ou revogados). */
export function deleteMissing(db: Db, source: string, prefix: string, keep: Set<string>) {
  const rows = db.prepare('SELECT url FROM documents WHERE source = ? AND substr(url, 1, ?) = ?').all(source, prefix.length, prefix) as { url: string }[];
  let removed = 0;
  for (const { url } of rows) if (!keep.has(url)) { db.prepare('DELETE FROM documents WHERE url = ?').run(url); removed++; }
  return removed;
}
export function hasDocument(db: Db, url: string) { return Boolean(db.prepare('SELECT 1 FROM documents WHERE url = ?').get(url)); }

export function setIndicator(db: Db, item: Indicator, now = new Date().toISOString()) {
  db.prepare(`INSERT INTO indicators (id, source, grp, label, value, unit, period, previous, url, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET source=excluded.source, grp=excluded.grp, label=excluded.label, value=excluded.value, unit=excluded.unit, period=excluded.period, previous=excluded.previous, url=excluded.url, fetched_at=excluded.fetched_at`)
    .run(item.id, item.source, item.group, item.label, item.value, item.unit, item.period, item.previous ?? null, item.url, now);
}

/** Estado simples por chave (ETag, última verificação, tamanho de arquivo remoto...). */
export function getState(db: Db, key: string) {
  return (db.prepare('SELECT value, updated_at AS updatedAt FROM state WHERE key = ?').get(key) as { value: string; updatedAt: string } | undefined);
}
export function setState(db: Db, key: string, value: string, now = new Date().toISOString()) {
  db.prepare('INSERT INTO state (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(key, value, now);
}
/** Verdadeiro quando a chave nunca foi verificada ou a última verificação passou do intervalo (ou na coleta completa). */
export function due(db: Db, key: string, everyMs: number, full = false, now = Date.now()) {
  const state = getState(db, key);
  return full || !state || now - Date.parse(state.updatedAt) >= everyMs;
}
export function setSeries(db: Db, id: string, period: string, value: number) {
  db.prepare('INSERT INTO series (id, period, value) VALUES (?,?,?) ON CONFLICT(id, period) DO UPDATE SET value=excluded.value').run(id, period, value);
}
export function getSeries(db: Db, id: string) {
  return (db.prepare('SELECT period, value FROM series WHERE id = ? ORDER BY period').all(id) as { period: string; value: number }[]).map(r => ({ period: r.period, value: r.value }));
}
/** Fila de URLs descobertas (rastreamento gradual de um portal): novas primeiro, depois as mais antigas para revisão. */
export function enqueue(db: Db, source: string, urls: string[], now = new Date().toISOString()) {
  const insert = db.prepare('INSERT OR IGNORE INTO queue (url, source, added_at) VALUES (?,?,?)');
  for (const url of urls) insert.run(url, source, now);
}
export function nextQueued(db: Db, source: string, limit: number, staleBefore: string) {
  return (db.prepare(`SELECT url FROM queue WHERE source = ? AND (fetched_at IS NULL OR fetched_at < ?) ORDER BY fetched_at IS NOT NULL, fetched_at LIMIT ?`).all(source, staleBefore, limit) as { url: string }[]).map(r => r.url);
}
export function markFetched(db: Db, url: string, now = new Date().toISOString()) { db.prepare('UPDATE queue SET fetched_at = ? WHERE url = ?').run(now, url); }

export function startRun(db: Db, source: string) {
  return Number(db.prepare('INSERT INTO runs (source, started_at, status) VALUES (?,?,?)').run(source, new Date().toISOString(), 'running').lastInsertRowid);
}
export function finishRun(db: Db, id: number, result: { fetched: number; changed: number; error?: string }) {
  db.prepare('UPDATE runs SET finished_at=?, status=?, fetched=?, changed=?, error=? WHERE id=?')
    .run(new Date().toISOString(), result.error ? 'error' : 'ok', result.fetched, result.changed, result.error?.slice(0, 300) ?? null, id);
}

/** Busca de texto integral (BM25) nas fontes externas, usada pelo chat para citar dados oficiais. */
export function searchDocuments(db: Db, terms: string[], limit = 3, sources?: string[]) {
  const words = terms.map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(t => t.length >= 3);
  if (!words.length) return [];
  const match = words.map(w => `"${w}"*`).join(' OR ');
  const filter = sources?.length ? `AND d.source IN (${sources.map(() => '?').join(',')})` : '';
  return db.prepare(`SELECT d.url, d.source, d.title, substr(d.content, 1, 1500) AS content, d.fetched_at AS fetchedAt FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
    WHERE documents_fts MATCH ? ${filter} ORDER BY bm25(documents_fts, 4.0, 1.0) LIMIT ?`).all(match, ...(sources ?? []), limit) as { url: string; source: string; title: string; content: string; fetchedAt: string }[];
}
