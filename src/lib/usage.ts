import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export type UsageDay = { date: string; requests: number; successes: number; errors: number; inputTokens: number; outputTokens: number; totalTokens: number; measured: number; durationMs: number };
type Event = { success: boolean; durationMs: number; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } };
const folder = path.join(process.cwd(), '.data');
const file = path.join(folder, 'usage.json');
let queue: Promise<unknown> = Promise.resolve();
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function empty(date: string): UsageDay { return { date, requests: 0, successes: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, measured: 0, durationMs: 0 }; }
async function localDays(): Promise<UsageDay[]> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
async function redis(command: (string | number)[]) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, { method: 'POST', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Metrics unavailable');
  const payload = await response.json();
  if (payload.error) throw new Error('Metrics unavailable');
  return payload.result;
}
function shared() { return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN); }
const script = `for i=1,#ARGV,2 do redis.call('HINCRBY',KEYS[1],ARGV[i],ARGV[i+1]) end; redis.call('EXPIRE',KEYS[1],86400*35); return 1`;
export async function recordUsage(event: Event): Promise<boolean> {
  const day = empty(today());
  day.requests = 1; day.successes = Number(event.success); day.errors = Number(!event.success);
  day.durationMs = Math.round(event.durationMs);
  day.inputTokens = event.usage?.inputTokens ?? 0; day.outputTokens = event.usage?.outputTokens ?? 0;
  day.totalTokens = event.usage?.totalTokens ?? day.inputTokens + day.outputTokens;
  day.measured = Number(event.usage?.totalTokens !== undefined || event.usage?.inputTokens !== undefined);
  try {
    if (shared()) {
      const pairs = Object.entries(day).filter(([key]) => key !== 'date').flatMap(([key, value]) => [key, value as number]);
      await redis(['EVAL', script, 1, `sindi:usage:${day.date}`, ...pairs]);
    } else {
      if (process.env.VERCEL) return false;
      const update = queue.then(async () => {
        const days = await localDays();
        const existing = days.find(d => d.date === day.date);
        if (existing) for (const key of Object.keys(day) as (keyof UsageDay)[]) { if (key !== 'date') existing[key] += day[key]; }
        else days.push(day);
        await mkdir(folder, { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify(days.sort((a, b) => a.date.localeCompare(b.date)).slice(-30)));
        await rename(`${file}.tmp`, file);
      });
      queue = update.catch(() => {}); await update;
    }
    return true;
  } catch { console.warn('SINDI metrics unavailable'); return false; }
}
export async function getUsage() {
  const dates = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - (29 - i)); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); });
  if (shared()) {
    const result = await Promise.all(dates.map(async date => {
      const raw = await redis(['HGETALL', `sindi:usage:${date}`]);
      const day = empty(date);
      if (!Array.isArray(raw)) throw new Error('Invalid metrics');
      for (let i = 0; i < raw.length; i += 2) { const key = raw[i] as keyof UsageDay; if (key !== 'date' && key in day) day[key] = Number(raw[i + 1]) || 0; }
      return day;
    }));
    return { days: result, storage: 'shared', available: true };
  }
  if (process.env.VERCEL) return { days: dates.map(empty), storage: 'unconfigured', available: false };
  await queue;
  const local = await localDays();
  return { days: dates.map(date => local.find(d => d.date === date) || empty(date)), storage: 'local', available: true };
}

