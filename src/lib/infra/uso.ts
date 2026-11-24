import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { redis, redisConfigurado as compartilhado } from '@/lib/infra/redis';
import { diaDaCota } from '@/lib/infra/cota';

/** Por provedor da cascata: quantas respostas cada um escreveu e quantos tokens gastou (só agregados, sem conteúdo). */
export type UsoDoProvedor = { requests: number; successes: number; tokens: number };
export type DiaDeUso = {
  date: string;
  requests: number;
  successes: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  measured: number;
  durationMs: number;
  provedores?: Record<string, UsoDoProvedor>;
  /** Contadores do dia de "o que o cérebro entregou": `conector:<id>`, `origem:<origem>`, `situacao:<situação>`. Só agregados, sem conteúdo. */
  cerebro?: Record<string, number>;
};
type EventoDeUso = {
  success: boolean;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  provedor?: string;
  /** Chaves de métrica do cérebro (ver chavesDeMetricaDoCerebro). */
  cerebro?: string[];
};
type Escalar = Exclude<keyof DiaDeUso, 'date' | 'provedores' | 'cerebro'>;
const ESCALARES: Escalar[] = [
  'requests',
  'successes',
  'errors',
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'measured',
  'durationMs',
];
const chaveDoCerebro = (c: string) => /^[a-z0-9][a-z0-9:_-]{0,59}$/i.test(c);
const idDoProvedor = (id?: string) => (id && /^[a-z0-9-]{1,20}$/.test(id) ? id : undefined);
const pasta = path.join(process.cwd(), '.data');
const arquivo = path.join(pasta, 'usage.json');
let fila: Promise<unknown> = Promise.resolve();
function diaVazio(date: string): DiaDeUso {
  return {
    date,
    requests: 0,
    successes: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    measured: 0,
    durationMs: 0,
  };
}
async function diasLocais(): Promise<DiaDeUso[]> {
  try {
    return JSON.parse(await readFile(arquivo, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
const roteiroLua = `for i=1,#ARGV,2 do redis.call('HINCRBY',KEYS[1],ARGV[i],ARGV[i+1]) end; redis.call('EXPIRE',KEYS[1],86400*35); return 1`;
export async function registrarUso(evento: EventoDeUso): Promise<boolean> {
  const dia = diaVazio(diaDaCota());
  dia.requests = 1;
  dia.successes = Number(evento.success);
  dia.errors = Number(!evento.success);
  dia.durationMs = Math.round(evento.durationMs);
  dia.inputTokens = evento.usage?.inputTokens ?? 0;
  dia.outputTokens = evento.usage?.outputTokens ?? 0;
  dia.totalTokens = evento.usage?.totalTokens ?? dia.inputTokens + dia.outputTokens;
  dia.measured = Number(evento.usage?.totalTokens !== undefined || evento.usage?.inputTokens !== undefined);
  const provedor = idDoProvedor(evento.provedor);
  if (provedor) dia.provedores = { [provedor]: { requests: 1, successes: dia.successes, tokens: dia.totalTokens } };
  const cerebro = [...new Set((evento.cerebro ?? []).filter(chaveDoCerebro))];
  if (cerebro.length) dia.cerebro = Object.fromEntries(cerebro.map((c) => [c, 1]));
  try {
    if (compartilhado()) {
      const pares: (string | number)[] = ESCALARES.flatMap((chave) => [chave, dia[chave]]);
      if (provedor)
        pares.push(
          `prov:${provedor}:requests`,
          1,
          `prov:${provedor}:successes`,
          dia.successes,
          `prov:${provedor}:tokens`,
          dia.totalTokens,
        );
      for (const c of cerebro) pares.push(`cer:${c}`, 1);
      await redis(['EVAL', roteiroLua, 1, `sindi:usage:${dia.date}`, ...pares]);
    } else {
      if (process.env.VERCEL) return false;
      const atualizacao = fila.then(async () => {
        const dias = await diasLocais();
        const existente = dias.find((d) => d.date === dia.date);
        if (existente) {
          for (const chave of ESCALARES) existente[chave] += dia[chave];
          for (const [id, uso] of Object.entries(dia.provedores ?? {})) {
            const atual = ((existente.provedores ??= {})[id] ??= { requests: 0, successes: 0, tokens: 0 });
            atual.requests += uso.requests;
            atual.successes += uso.successes;
            atual.tokens += uso.tokens;
          }
          for (const [c, n] of Object.entries(dia.cerebro ?? {}))
            (existente.cerebro ??= {})[c] = (existente.cerebro[c] ?? 0) + n;
        } else dias.push(dia);
        await mkdir(pasta, { recursive: true });
        await writeFile(`${arquivo}.tmp`, JSON.stringify(dias.sort((a, b) => a.date.localeCompare(b.date)).slice(-30)));
        await rename(`${arquivo}.tmp`, arquivo);
      });
      fila = atualizacao.catch(() => {});
      await atualizacao;
    }
    leitura = undefined;
    return true;
  } catch {
    console.warn('SINDI metrics unavailable');
    return false;
  }
}
let leitura: { em: number; modo: string; valor: Awaited<ReturnType<typeof lerUso>> } | undefined;
const modoDeArmazenamento = () => (compartilhado() ? 'compartilhado' : process.env.VERCEL ? 'vercel' : 'local');
/** A leitura dos 30 dias (30 consultas ao Redis) fica 30 s em memória: o painel público pode ser aberto muitas vezes, e as métricas não precisam ser instantâneas. */
export async function obterUso() {
  const modo = modoDeArmazenamento();
  if (leitura && leitura.modo === modo && Date.now() - leitura.em < 30_000) return leitura.valor;
  const valor = await lerUso();
  leitura = { em: Date.now(), modo, valor };
  return valor;
}
export function esquecerLeituraDeUso() {
  leitura = undefined;
}
async function lerUso() {
  const datas = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (29 - i));
    return diaDaCota(d);
  });
  if (compartilhado()) {
    const resultado = await Promise.all(
      datas.map(async (data) => {
        const bruto = await redis(['HGETALL', `sindi:usage:${data}`]);
        const dia = diaVazio(data);
        if (!Array.isArray(bruto)) throw new Error('Invalid metrics');
        for (let i = 0; i < bruto.length; i += 2) {
          const chave = String(bruto[i]);
          const valor = Number(bruto[i + 1]) || 0;
          const prov = chave.match(/^prov:([a-z0-9-]{1,20}):(requests|successes|tokens)$/);
          if (prov) {
            ((dia.provedores ??= {})[prov[1]] ??= { requests: 0, successes: 0, tokens: 0 })[
              prov[2] as keyof UsoDoProvedor
            ] = valor;
          } else if (chave.startsWith('cer:') && chaveDoCerebro(chave.slice(4)))
            (dia.cerebro ??= {})[chave.slice(4)] = valor;
          else if ((ESCALARES as string[]).includes(chave)) dia[chave as Escalar] = valor;
        }
        return dia;
      }),
    );
    return { days: resultado, storage: 'shared', available: true };
  }
  if (process.env.VERCEL) return { days: datas.map(diaVazio), storage: 'unconfigured', available: false };
  await fila;
  const local = await diasLocais();
  return {
    days: datas.map((data) => local.find((d) => d.date === data) || diaVazio(data)),
    storage: 'local',
    available: true,
  };
}
