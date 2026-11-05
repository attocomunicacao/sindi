import { mkdir, readFile, writeFile, rename, open, unlink, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import { PDFParse } from 'pdf-parse';
import { Agent, setGlobalDispatcher } from 'undici';
import { setDefaultResultOrder } from 'node:dns';
import { SITE, chunks, type KnowledgeDocument, type KnowledgeSnapshot } from '../src/lib/knowledge/core';
import { siteUrl, pdfUrl, extractHtml } from '../src/lib/knowledge/extract';
import { supabaseRequest } from '../src/lib/knowledge/supabase';

const directory = '.data/knowledge';
const agent = 'SINDI-Knowledge/1.0';
setDefaultResultOrder('ipv4first');
setGlobalDispatcher(new Agent({ connect: { autoSelectFamily: true, timeout: 20000 } }));
const interval = 15 * 60 * 1000;
const maxBytes = 25 * 1024 * 1024;
const maxDocuments = 15000; // Operational ceiling; report incomplete coverage instead of silently truncating.
await mkdir(directory, { recursive: true });
async function log(message: string, error = false) {
  await appendFile(`${directory}/${error ? 'worker-error' : 'worker'}.log`, `${new Date().toISOString()} ${message}\n`);
}
// Environment files are loaded by Node, never printed or copied into the corpus.
for (const file of ['.env.knowledge', '.env.knowledge.local']) {
  try { process.loadEnvFile(file); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
}
const lockPath = `${directory}/sync.lock`;
try { const lock = await open(lockPath, 'wx'); await lock.writeFile(String(process.pid)); await lock.close(); }
catch {
  const pid = Number(await readFile(lockPath, 'utf8'));
  try { process.kill(pid, 0); throw new Error('Uma sincronização já está ativa'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
  await unlink(lockPath); const lock = await open(lockPath, 'wx'); await lock.writeFile(String(process.pid)); await lock.close();
}
let stopping = false;
process.on('SIGINT', () => { stopping = true; }); process.on('SIGTERM', () => { stopping = true; });
const robots = new Map<string, ReturnType<typeof robotsParser>>();
let nextRequest = 0;
async function download(url: string, headers: Record<string, string> = {}, checkRobots = true) {
  const robotsUrl = new URL(url).pathname === '/robots.txt' && ['www.sindeprestem.com.br', 'docs.wixstatic.com', 'www.sindeprestem.org.br'].includes(new URL(url).hostname);
  if (!siteUrl(url) && !pdfUrl(url) && !robotsUrl) throw new Error('URL fora da lista permitida');
  const origin = new URL(url).origin;
  if (checkRobots) {
    if (!robots.has(origin)) {
      const response = await download(`${origin}/robots.txt`, {}, false);
      if (response.status !== 404 && !response.ok) throw new Error('robots.txt indisponível');
      robots.set(origin, robotsParser(`${origin}/robots.txt`, response.ok ? await response.text() : ''));
    }
    if (robots.get(origin)!.isAllowed(url, agent) === false) throw new Error('robots.txt bloqueou a página');
  }
  const wait = Math.max(0, nextRequest - Date.now()); nextRequest = Math.max(nextRequest, Date.now()) + 300;
  if (wait) await delay(wait);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { response = await fetch(url, { headers: { 'User-Agent': agent, ...headers }, redirect: 'manual', signal: AbortSignal.timeout(45000) }); if (response.status < 500 && response.status !== 429) break; }
    catch (e) { if (attempt === 2) throw e; }
    await delay(1000 * (attempt + 1));
  }
  if (!response) throw new Error('Falha de rede');
  if ([301,302,303,307,308].includes(response.status)) {
    const target = new URL(response.headers.get('location') || '', url).href;
    if (target === url || (!siteUrl(target) && !pdfUrl(target))) throw new Error('Redirecionamento não permitido');
    // One hop; refusing loops avoids unbounded fetches.
    const redirected = await downloadOnce(target, headers);
    return redirected;
  }
  return response;
}
async function downloadOnce(url: string, headers: Record<string, string>) {
  const origin = new URL(url).origin;
  if (!robots.has(origin)) {
    const r = await fetch(`${origin}/robots.txt`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!r.ok && r.status !== 404) throw new Error('robots.txt indisponível');
    robots.set(origin, robotsParser(`${origin}/robots.txt`, r.ok ? await r.text() : ''));
  }
  if (robots.get(origin)!.isAllowed(url, agent) === false) throw new Error('robots.txt bloqueou redirecionamento');
  return fetch(url, { headers: { 'User-Agent': agent, ...headers }, redirect: 'error', signal: AbortSignal.timeout(45000) });
}
async function bytes(response: Response) {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Arquivo excede 25MB'); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('Sem conteúdo');
  let length = 0; const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length; if (length > maxBytes) { await reader.cancel(); throw new Error('Arquivo excede 25MB'); } parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
async function discover() {
  robots.clear();
  const urls = new Map<string, string>(); const seen = new Set<string>();
  const sitemapQueue = [`${SITE}/sitemap.xml`];
  while (sitemapQueue.length) {
    const url = sitemapQueue.shift()!; if (seen.has(url)) continue; seen.add(url);
    if (seen.size > 50) throw new Error('Sitemaps excedem limite operacional');
    const r = await download(url); if (!r.ok) throw new Error(`Sitemap HTTP ${r.status}`);
    const $ = load((await bytes(r)).toString('utf8'), { xml: true });
    if ($('sitemapindex').length) $('sitemap > loc').each((_, el) => { const u = siteUrl($(el).text()); if (u) sitemapQueue.push(u); });
    else $('url').each((_, el) => { const u = siteUrl($(el).find('loc').text()); if (u) urls.set(u, $(el).find('lastmod').text()); });
  }
  for (const pathname of ['', '/contato', '/noticias', '/convencoes-coletivas', '/juridico', '/cartilhas']) urls.set(`${SITE}${pathname}`, '');
  return urls;
}
async function atomic(file: string, value: unknown) {
  await writeFile(`${file}.tmp`, JSON.stringify(value));
  // Windows antivirus/readers can briefly deny replacing an open destination.
  for (let attempt = 0; ; attempt++) {
    try { await rename(`${file}.tmp`, file); return; }
    catch (e) {
      if (attempt >= 19 || !['EPERM','EACCES','EBUSY'].includes((e as NodeJS.ErrnoException).code || '')) throw e;
      await delay(250);
    }
  }
}
async function run() {
  const started = new Date().toISOString();
  let previous: KnowledgeSnapshot = { updatedAt: '', documents: [] };
  try { previous = JSON.parse(await readFile(`${directory}/current.json`, 'utf8')); } catch { /* First collection. */ }
  const documents = new Map(previous.documents.map(d => [d.url, d]));
  await log(`Iniciando varredura; ${documents.size} documentos no espelho local`);
  await atomic(`${directory}/status.json`, { phase: 'running', startedAt: started, heartbeatAt: started,
    discovered: 0, checked: 0, documents: documents.size, uploaded: 0, cloudErrors: 0,
    cloudConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY), incomplete: true, failures: [], externalLinks: [], intervalMinutes: 15 });
  const discovered = await discover();
  const queue = [...discovered].sort(([a, ad], [b, bd]) => Number(a.includes('/post/')) - Number(b.includes('/post/')) || bd.localeCompare(ad));
  const scheduled = new Set(discovered.keys());
  const visited = new Set<string>(); const failures: { url: string; reason: string }[] = []; const external = new Set<string>();
  let changed = 0; let unchanged = 0; let skipped = 0; let uploaded = 0; let cloudErrors = 0; let truncated = false;
  let workerFailed = false;
  const cloud = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  let cloudState: Record<string, string> = {};
  try { cloudState = JSON.parse(await readFile(`${directory}/cloud-state.json`, 'utf8')); } catch { /* First upload. */ }
  let lastSave = Date.now();
  let saving: Promise<void> = Promise.resolve();
  async function save() { saving = saving.then(async () => {
    await atomic(`${directory}/current.json`, { updatedAt: started, documents: [...documents.values()] });
    await atomic(`${directory}/cloud-state.json`, cloudState);
    await atomic(`${directory}/status.json`, { phase: 'running', startedAt: started, heartbeatAt: new Date().toISOString(), discovered: discovered.size,
      checked: visited.size, documents: documents.size, changed, unchanged, skipped, uploaded, cloudErrors, cloudConfigured: cloud,
      incomplete: true, failures, externalLinks: [...external], intervalMinutes: 15 });
  }); await saving; }
  async function upload(document: KnowledgeDocument) {
    if (!cloud) return;
    const signature = `${process.env.SUPABASE_URL}:${document.hash}:${document.checkedAt}:${document.status}`;
    if (cloudState[document.url] === signature) { uploaded++; return; }
    try {
      await supabaseRequest('rpc/upsert_sindi_document', { document: { ...document, chunks: chunks(document.content) } }, true);
      cloudState[document.url] = signature; uploaded++;
    } catch { cloudErrors++; failures.push({ url: document.url, reason: 'Supabase indisponível: espelho local preservado' }); }
  }
  async function worker() {
    while (queue.length && !stopping && !workerFailed) {
      if (visited.size >= maxDocuments) { truncated = true; break; }
      const [url, lastmod] = queue.shift()!; if (visited.has(url)) continue; visited.add(url);
      const old = documents.get(url); const now = new Date().toISOString();
      // Current listings every 15 minutes; historical pages at least daily or when sitemap changes.
      if (old && url.includes('/post/') && Date.now() - Date.parse(old.checkedAt) < 86400000 &&
          (!lastmod || Date.parse(lastmod) <= Date.parse(old.fetchedAt))) {
        skipped++; if (cloud) await upload(old); continue;
      }
      try {
        const r = await download(url, old ? { ...(old.etag ? { 'If-None-Match': old.etag } : {}), ...(old.lastModified ? { 'If-Modified-Since': old.lastModified } : {}) } : {});
        if (r.status === 304 && old) { old.checkedAt = now; unchanged++; await upload(old); for (const link of old.links) if (!scheduled.has(link)) { scheduled.add(link); queue.unshift([link, '']); } continue; }
        if ([404,410].includes(r.status)) {
          if (old) { old.status = 'removed'; old.checkedAt = now; await upload(old); }
          failures.push({ url, reason: `HTTP ${r.status}: retirado da busca` }); continue;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await bytes(r); const type = r.headers.get('content-type') || '';
        const pdf = type.includes('application/pdf') || data.subarray(0,5).toString() === '%PDF-';
        let extracted;
        if (pdf) {
          const parser = new PDFParse({ data });
          try { extracted = { title: decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Documento PDF'), content: (await parser.getText()).text.trim(), links: [], external: [], publishedAt: undefined }; }
          finally { await parser.destroy(); }
        } else {
          if (!type.includes('text/html')) throw new Error('Formato não suportado');
          extracted = extractHtml(data.toString('utf8'), url);
        }
        if (extracted.content.length < 40) throw new Error(pdf ? 'PDF sem texto: precisa de OCR' : 'Página sem texto: precisa de revisão');
        if (extracted.content.length > 1500000) throw new Error('Texto excede limite operacional');
        const hash = createHash('sha256').update(extracted.title + '\n' + extracted.content).digest('hex');
        const document: KnowledgeDocument = { url, ...extracted, hash, fetchedAt: old?.hash === hash ? old.fetchedAt : now,
          checkedAt: now, etag: r.headers.get('etag') || undefined, lastModified: r.headers.get('last-modified') || undefined, kind: pdf ? 'pdf' : 'html', status: 'active' };
        documents.set(url, document); if (old?.hash === hash) unchanged++; else changed++;
        for (const link of extracted.links) if (!scheduled.has(link)) { scheduled.add(link); queue.unshift([link, '']); }
        for (const link of extracted.external) external.add(link);
        await upload(document);
      } catch (e) { failures.push({ url, reason: e instanceof Error ? e.message : 'Falha de coleta' }); }
      if (Date.now() - lastSave > 10000) {
        lastSave = Date.now();
        try { await save(); } catch (e) { workerFailed = true; throw e; }
      }
      if (visited.size % 50 === 0) await log(`Coleta: ${visited.size} URLs, ${documents.size} documentos, ${failures.length} pendências`);
    }
  }
  const workers = await Promise.allSettled([worker(),worker(),worker(),worker()]);
  const failure = workers.find(r => r.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  await save();
  const report = { phase: 'completed', startedAt: started, finishedAt: new Date().toISOString(), discovered: discovered.size, checked: visited.size, documents: documents.size,
    changed, unchanged, skipped, uploaded, cloudErrors, cloudConfigured: cloud, incomplete: truncated || stopping || failures.length > 0,
    failures, externalLinks: [...external], intervalMinutes: 15 };
  await atomic(`${directory}/status.json`, report);
  if (cloud) try { await supabaseRequest('rpc/record_sindi_sync', { summary: { ...report, failures: failures.slice(0,20), externalLinks: external.size } }, true); } catch { /* Local report remains available. */ }
  await log(JSON.stringify({ ...report, failures: report.failures.length, externalLinks: report.externalLinks.length }));
}
try {
  do {
    try { await run(); } catch (e) { await log(`Sincronização não concluída: ${e instanceof Error ? e.message : 'falha'}`, true); if (!process.argv.includes('--watch')) process.exitCode = 1; }
    if (!process.argv.includes('--watch') || stopping) break;
    // Interruptible wait keeps Ctrl+C responsive without scheduling overlapping runs.
    for (let elapsed = 0; elapsed < interval && !stopping; elapsed += 1000) await delay(1000);
  } while (!stopping);
} finally { await unlink(lockPath).catch(() => {}); }
