// Uso: npm run dados:sync [-- --only=ibge,camara] [-- --full]   |   npm run dados:watch  (a cada 30 minutos)
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { dataDir, due, openDb, setState } from '../../src/lib/dados/db';
import { publicarCerebro } from '../../src/lib/cerebro/publicar';
import { embeddings, indexarCerebro } from '../../src/lib/cerebro/embeddings';
import { syncAll } from '../../src/lib/dados/sync';

const args = process.argv.slice(2);
const watch = args.includes('--watch'); const full = args.includes('--full');
const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
const intervalMinutes = Number(process.env.DADOS_INTERVAL_MINUTES || 30);
await mkdir(dataDir(), { recursive: true });
// Um único processo escritor por vez.
const lock = path.join(dataDir(), 'sync.lock');
try { const f = await open(lock, 'wx'); await f.writeFile(String(process.pid)); await f.close(); }
catch {
  const pid = Number(await readFile(lock, 'utf8').catch(() => 0));
  let alive = false; try { process.kill(pid, 0); alive = true; } catch { /* processo antigo encerrado */ }
  if (alive) { console.error('Já existe uma coleta ativa (PID ' + pid + ').'); process.exit(1); }
  await unlink(lock); const f = await open(lock, 'wx'); await f.writeFile(String(process.pid)); await f.close();
}
let stopping = false;
const release = async () => { await unlink(lock).catch(() => {}); };
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true; void release().then(() => process.exit(0)); });
const db = openDb();
const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);
try {
  do {
    log(`Coleta iniciada${full ? ' (completa)' : ''}${only ? ' [' + only.join(',') + ']' : ''}`);
    await syncAll(db, { only, full: full && !watch, log });
    log('Planilha atualizada');
    // O cérebro autogerado (cerebro/auto) é regenerado a cada 6 horas, com validação e reversão se a avaliação piorar.
    if (!only && due(db, 'cerebro:publicacao', 6 * 60 * 60 * 1000, full)) {
      try { const r = await publicarCerebro(db, log); log(`Cérebro: ${r.motivo}`); setState(db, 'cerebro:publicacao', new Date().toISOString()); }
      catch (cause) { log(`Cérebro: erro ao regenerar (${cause instanceof Error ? cause.message : 'desconhecido'}); arquivos anteriores mantidos`); }
    }
    // Busca por significado: indexa o que mudou no cérebro e mantém o modelo de embeddings carregado (a primeira consulta fria é lenta).
    try { await indexarCerebro(undefined, log); await embeddings(['aquecimento'], 'consulta', 20000); }
    catch (cause) { log(`Cérebro: busca por significado indisponível (${cause instanceof Error ? cause.message : 'desconhecido'}); o chat usa a busca por palavras`); }
    if (watch && !stopping) await delay(intervalMinutes * 60 * 1000);
  } while (watch && !stopping);
} finally { await release(); }
