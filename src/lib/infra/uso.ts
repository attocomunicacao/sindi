import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { redis, redisConfigurado as shared } from '@/lib/infra/redis';
import { diaDaCota } from '@/lib/infra/cota';

/** Por provedor da cascata: quantas respostas cada um escreveu e quantos tokens gastou (só agregados, sem conteúdo). */
export type UsoDoProvedor = { requests: number; successes: number; tokens: number };
export type DiaDeUso = { date: string; requests: number; successes: number; errors: number; inputTokens: number; outputTokens: number; totalTokens: number; measured: number; durationMs: number; provedores?: Record<string, UsoDoProvedor> };
type Event = { success: boolean; durationMs: number; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; provedor?: string };
type Escalar = Exclude<keyof DiaDeUso, 'date' | 'provedores'>;
const ESCALARES: Escalar[] = ['requests', 'successes', 'errors', 'inputTokens', 'outputTokens', 'totalTokens', 'measured', 'durationMs'];
const idDoProvedor = (id?: string) => (id && /^[a-z0-9-]{1,20}$/.test(id) ? id : undefined);
const folder = path.join(process.cwd(), '.data');
const file = path.join(folder, 'usage.json');
let queue: Promise<unknown> = Promise.resolve();
function empty(date: string): DiaDeUso { return { date, requests: 0, successes: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, measured: 0, durationMs: 0 }; }
async function localDays(): Promise<DiaDeUso[]> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
const script = `for i=1,#ARGV,2 do redis.call('HINCRBY',KEYS[1],ARGV[i],ARGV[i+1]) end; redis.call('EXPIRE',KEYS[1],86400*35); return 1`;
export async function registrarUso(event: Event): Promise<boolean> {
  const day = empty(diaDaCota());
  day.requests = 1; day.successes = Number(event.success); day.errors = Number(!event.success);
  day.durationMs = Math.round(event.durationMs);
  day.inputTokens = event.usage?.inputTokens ?? 0; day.outputTokens = event.usage?.outputTokens ?? 0;
  day.totalTokens = event.usage?.totalTokens ?? day.inputTokens + day.outputTokens;
  day.measured = Number(event.usage?.totalTokens !== undefined || event.usage?.inputTokens !== undefined);
  const provedor = idDoProvedor(event.provedor);
  if (provedor) day.provedores = { [provedor]: { requests: 1, successes: day.successes, tokens: day.totalTokens } };
  try {
    if (shared()) {
      const pairs: (string | number)[] = ESCALARES.flatMap(key => [key, day[key]]);
      if (provedor) pairs.push(`prov:${provedor}:requests`, 1, `prov:${provedor}:successes`, day.successes, `prov:${provedor}:tokens`, day.totalTokens);
      await redis(['EVAL', script, 1, `sindi:usage:${day.date}`, ...pairs]);
    } else {
      if (process.env.VERCEL) return false;
      const update = queue.then(async () => {
        const days = await localDays();
        const existing = days.find(d => d.date === day.date);
        if (existing) {
          for (const key of ESCALARES) existing[key] += day[key];
          for (const [id, uso] of Object.entries(day.provedores ?? {})) {
            const atual = (existing.provedores ??= {})[id] ??= { requests: 0, successes: 0, tokens: 0 };
            atual.requests += uso.requests; atual.successes += uso.successes; atual.tokens += uso.tokens;
          }
        } else days.push(day);
        await mkdir(folder, { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify(days.sort((a, b) => a.date.localeCompare(b.date)).slice(-30)));
        await rename(`${file}.tmp`, file);
      });
      queue = update.catch(() => {}); await update;
    }
    leitura = undefined;
    return true;
  } catch { console.warn('SINDI metrics unavailable'); return false; }
}
let leitura: { em: number; modo: string; valor: Awaited<ReturnType<typeof lerUso>> } | undefined;
const modoDeArmazenamento = () => (shared() ? 'compartilhado' : process.env.VERCEL ? 'vercel' : 'local');
/** A leitura dos 30 dias (30 consultas ao Redis) fica 30 s em memória: o painel público pode ser aberto muitas vezes, e as métricas não precisam ser instantâneas. */
export async function obterUso() {
  const modo = modoDeArmazenamento();
  if (leitura && leitura.modo === modo && Date.now() - leitura.em < 30_000) return leitura.valor;
  const valor = await lerUso(); leitura = { em: Date.now(), modo, valor }; return valor;
}
export function esquecerLeituraDeUso() { leitura = undefined; }
async function lerUso() {
  const dates = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - (29 - i)); return diaDaCota(d); });
  if (shared()) {
    const result = await Promise.all(dates.map(async date => {
      const raw = await redis(['HGETALL', `sindi:usage:${date}`]);
      const day = empty(date);
      if (!Array.isArray(raw)) throw new Error('Invalid metrics');
      for (let i = 0; i < raw.length; i += 2) {
        const key = String(raw[i]); const valor = Number(raw[i + 1]) || 0;
        const prov = key.match(/^prov:([a-z0-9-]{1,20}):(requests|successes|tokens)$/);
        if (prov) { ((day.provedores ??= {})[prov[1]] ??= { requests: 0, successes: 0, tokens: 0 })[prov[2] as keyof UsoDoProvedor] = valor; }
        else if ((ESCALARES as string[]).includes(key)) day[key as Escalar] = valor;
      }
      return day;
    }));
    return { days: result, storage: 'shared', available: true };
  }
  if (process.env.VERCEL) return { days: dates.map(empty), storage: 'unconfigured', available: false };
  await queue;
  const local = await localDays();
  return { days: dates.map(date => local.find(d => d.date === date) || empty(date)), storage: 'local', available: true };
}

