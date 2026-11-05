import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { dataDir, getSeries, getState, setSeries, setState, setIndicator, upsertDocument, type Db } from '../db';
import type { Collector } from './types';

const run = promisify(execFile);
export const CAGED_FTP = 'ftp://ftp.mtps.gov.br/pdet/microdados/NOVO%20CAGED/';
/** Link navegável (o FTP não abre em todos os navegadores e é bloqueado nos links do chat): notícias do Ministério, onde o resultado mensal é divulgado. */
export const CAGED_PAGE = 'https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo';
const TEMPORARY = '7820500'; // CNAE 7820-5: locação de mão de obra temporária
const SP = '35';

export type Totals = { admissions: number; dismissals: number };
export type Aggregate = Record<'brasil' | 'sp' | 'servicos' | 'servicosSp' | 'temporario' | 'temporarioSp', Totals>;
export const emptyAggregate = (): Aggregate => ({ brasil: { admissions: 0, dismissals: 0 }, sp: { admissions: 0, dismissals: 0 }, servicos: { admissions: 0, dismissals: 0 }, servicosSp: { admissions: 0, dismissals: 0 }, temporario: { admissions: 0, dismissals: 0 }, temporarioSp: { admissions: 0, dismissals: 0 } });
export const net = (t: Totals) => t.admissions - t.dismissals;

/** Soma uma linha do arquivo CAGEDMOV (separador ';'): seção N = atividades administrativas e serviços complementares. */
export function addLine(aggregate: Aggregate, line: string, month: string) {
  const c = line.split(';');
  if (c.length < 7 || c[0] !== month) return;
  const balance = Number(c[6]); if (balance !== 1 && balance !== -1) return;
  const bump = (t: Totals) => { if (balance === 1) t.admissions++; else t.dismissals++; };
  const sp = c[2] === SP; const services = c[4] === 'N'; const temporary = c[5] === TEMPORARY;
  bump(aggregate.brasil);
  if (sp) bump(aggregate.sp);
  if (services) { bump(aggregate.servicos); if (sp) bump(aggregate.servicosSp); }
  if (temporary) { bump(aggregate.temporario); if (sp) bump(aggregate.temporarioSp); }
}
export const monthLabel = (month: string) => `${month.slice(4)}/${month.slice(0, 4)}`;
export function parseListing(text: string) { return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean); }

const curl = (url: string, args: string[] = []) => run('curl', ['-s', '--fail', '-m', '900', ...args, url], { maxBuffer: 16 * 1024 * 1024, encoding: 'buffer' });
async function list(url: string) { return parseListing(((await curl(url)).stdout as unknown as Buffer).toString('latin1')); }
const extractor = () => process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : '7z';
const extractArgs = (archive: string, target: string) => process.platform === 'win32' ? ['-xf', archive, '-C', target] : ['x', '-y', `-o${target}`, archive];

/** Novo CAGED: baixa o CAGEDMOV do mês, soma admissões e desligamentos em fluxo (sem carregar o arquivo na memória) e apaga os temporários. */
async function aggregateMonth(year: string, month: string): Promise<Aggregate> {
  const work = path.join(dataDir(), 'tmp', `caged-${month}`);
  await rm(work, { recursive: true, force: true }); await mkdir(work, { recursive: true });
  try {
    const archive = path.join(work, `CAGEDMOV${month}.7z`);
    await curl(`${CAGED_FTP}${year}/${month}/CAGEDMOV${month}.7z`, ['-o', archive]);
    await run(extractor(), extractArgs(archive, work), { maxBuffer: 1024 * 1024 });
    const txt = (await readdir(work)).find(f => /\.txt$/i.test(f));
    if (!txt) throw new Error('Arquivo CAGEDMOV sem .txt após extração');
    const aggregate = emptyAggregate();
    for await (const line of createInterface({ input: createReadStream(path.join(work, txt), { encoding: 'utf8' }), crlfDelay: Infinity })) addLine(aggregate, line, month);
    if (aggregate.brasil.admissions + aggregate.brasil.dismissals < 100000) throw new Error('Totais do CAGED implausíveis; arquivo possivelmente incompleto');
    return aggregate;
  } finally { await rm(work, { recursive: true, force: true }); }
}
const SERIES: [keyof Aggregate, string, string][] = [
  ['brasil', 'caged.saldo', 'Saldo de emprego formal — Brasil'],
  ['sp', 'caged.saldo-sp', 'Saldo de emprego formal — São Paulo'],
  ['servicos', 'caged.saldo-servicos', 'Saldo — serviços administrativos e complementares (seção N)'],
  ['temporario', 'caged.saldo-temporario', 'Saldo — locação de mão de obra temporária (CNAE 7820-5)'],
];
function publish(db: Db) {
  for (const [, id, label] of SERIES) {
    const series = getSeries(db, id); const last = series.at(-1); if (!last) continue;
    setIndicator(db, { id, source: 'caged', group: 'Emprego formal', label, value: last.value, unit: 'vagas no mês', period: monthLabel(last.period), previous: series.at(-2)?.value, url: CAGED_PAGE });
  }
}
const HOUR = 60 * 60 * 1000;

export const caged: Collector = {
  source: 'caged', label: 'CAGED (Ministério do Trabalho)',
  async run({ db, full }) {
    // O MTE publica uma vez por mês; verificar o FTP a cada ciclo só custa uma listagem pequena, mas limitamos a 1 hora.
    const lastCheck = getState(db, 'caged:check');
    if (!full && lastCheck && Date.now() - Date.parse(lastCheck.updatedAt) < HOUR) { publish(db); return { fetched: 0, changed: 0 }; }
    let fetched = 0; let changed = 0;
    const years = (await list(CAGED_FTP)).map(l => l.match(/<DIR>\s+(20\d{2})$/)?.[1]).filter((y): y is string => Boolean(y)).sort(); fetched++;
    const candidates: { year: string; month: string }[] = [];
    for (const year of years.slice(-3).reverse()) {
      const months = (await list(`${CAGED_FTP}${year}/`)).map(l => l.match(/<DIR>\s+(\d{6})$/)?.[1]).filter((m): m is string => Boolean(m)).sort().reverse(); fetched++;
      candidates.push(...months.map(month => ({ year, month })));
    }
    for (const { year, month } of candidates.slice(0, full ? 24 : 3)) {
      const files = await list(`${CAGED_FTP}${year}/${month}/`); fetched++;
      const size = files.find(l => l.includes(`CAGEDMOV${month}.7z`))?.match(/\s(\d+)\s+CAGEDMOV/)?.[1];
      if (!size) continue;
      const known = getState(db, `caged:size:${month}`)?.value;
      if (known === size && getSeries(db, 'caged.saldo').some(p => p.period === month)) continue; // inalterado desde a última coleta
      const aggregate = await aggregateMonth(year, month); fetched++;
      for (const [key, id] of SERIES) setSeries(db, id, month, net(aggregate[key]));
      setSeries(db, 'caged.saldo-temporario-sp', month, net(aggregate.temporarioSp)); setSeries(db, 'caged.saldo-servicos-sp', month, net(aggregate.servicosSp));
      const fmt = (n: number) => n.toLocaleString('pt-BR');
      const line = (name: string, t: Totals) => `${name}: ${fmt(t.admissions)} admissões, ${fmt(t.dismissals)} desligamentos, saldo ${fmt(net(t))}.`;
      const content = [`Novo CAGED — competência ${monthLabel(month)} (arquivo CAGEDMOV, base do número divulgado pelo Ministério no mês; declarações fora do prazo e exclusões posteriores não são aplicadas).`,
        line('Brasil', aggregate.brasil), line('São Paulo', aggregate.sp), line('Serviços administrativos e complementares (seção N), Brasil', aggregate.servicos), line('Serviços administrativos e complementares (seção N), São Paulo', aggregate.servicosSp),
        line('Locação de mão de obra temporária (CNAE 7820-5), Brasil', aggregate.temporario), line('Locação de mão de obra temporária (CNAE 7820-5), São Paulo', aggregate.temporarioSp)].join('\n');
      if (upsertDocument(db, { source: 'caged', url: `${CAGED_FTP}${year}/${month}/`, title: `Novo CAGED — ${monthLabel(month)}`, content, publishedAt: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4)) , 1)).toISOString(), meta: { month } })) changed++;
      setState(db, `caged:size:${month}`, size);
    }
    setState(db, 'caged:check', new Date().toISOString());
    publish(db);
    return { fetched, changed };
  },
};
