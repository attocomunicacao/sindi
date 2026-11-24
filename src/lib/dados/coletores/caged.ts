import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { pastaDosDados, lerSerie, lerEstado, gravarSerie, gravarEstado, gravarIndicador, gravarDocumento, type BancoDeDados } from '@/lib/dados/db';
import type { Coletor } from '@/lib/dados/coletores/tipos';
import { numeroBR } from '@/lib/base/formato';

const executar = promisify(execFile);
export const CAGED_FTP = 'ftp://ftp.mtps.gov.br/pdet/microdados/NOVO%20CAGED/';
/** Link navegável (o FTP não abre em todos os navegadores e é bloqueado nos links do chat): notícias do Ministério, onde o resultado mensal é divulgado. */
export const PAGINA_DO_CAGED = 'https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo';
const CNAE_TEMPORARIO = '7820500'; // CNAE 7820-5: locação de mão de obra temporária
const CODIGO_SP = '35';

export type Totais = { admissions: number; dismissals: number };
export type Agregado = Record<'brasil' | 'sp' | 'servicos' | 'servicosSp' | 'temporario' | 'temporarioSp', Totais>;
export const agregadoVazio = (): Agregado => ({ brasil: { admissions: 0, dismissals: 0 }, sp: { admissions: 0, dismissals: 0 }, servicos: { admissions: 0, dismissals: 0 }, servicosSp: { admissions: 0, dismissals: 0 }, temporario: { admissions: 0, dismissals: 0 }, temporarioSp: { admissions: 0, dismissals: 0 } });
export const saldoLiquido = (t: Totais) => t.admissions - t.dismissals;

/** Soma uma linha do arquivo CAGEDMOV (separador ';'): seção N = atividades administrativas e serviços complementares. */
export function somarLinha(agregado: Agregado, linha: string, mes: string) {
  const c = linha.split(';');
  if (c.length < 7 || c[0] !== mes) return;
  const variacaoDeVagas = Number(c[6]); if (variacaoDeVagas !== 1 && variacaoDeVagas !== -1) return;
  const contar = (t: Totais) => { if (variacaoDeVagas === 1) t.admissions++; else t.dismissals++; };
  const sp = c[2] === CODIGO_SP; const servicos = c[4] === 'N'; const temporario = c[5] === CNAE_TEMPORARIO;
  contar(agregado.brasil);
  if (sp) contar(agregado.sp);
  if (servicos) { contar(agregado.servicos); if (sp) contar(agregado.servicosSp); }
  if (temporario) { contar(agregado.temporario); if (sp) contar(agregado.temporarioSp); }
}
export const rotuloDoMes = (mes: string) => `${mes.slice(4)}/${mes.slice(0, 4)}`;
export function lerListagem(texto: string) { return texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean); }

const baixarComCurl = (url: string, args: string[] = []) => executar('curl', ['-s', '--fail', '-m', '900', ...args, url], { maxBuffer: 16 * 1024 * 1024, encoding: 'buffer' });
async function listar(url: string) { return lerListagem(((await baixarComCurl(url)).stdout as unknown as Buffer).toString('latin1')); }
const extratorDeArquivo = () => process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : '7z';
const argumentosDeExtracao = (arquivo: string, target: string) => process.platform === 'win32' ? ['-xf', arquivo, '-C', target] : ['x', '-y', `-o${target}`, arquivo];

/** Novo CAGED: baixa o CAGEDMOV do mês, soma admissões e desligamentos em fluxo (sem carregar o arquivo na memória) e apaga os temporários. */
async function agregarMes(ano: string, mes: string): Promise<Agregado> {
  const pastaDeTrabalho = path.join(pastaDosDados(), 'tmp', `caged-${mes}`);
  await rm(pastaDeTrabalho, { recursive: true, force: true }); await mkdir(pastaDeTrabalho, { recursive: true });
  try {
    const arquivo = path.join(pastaDeTrabalho, `CAGEDMOV${mes}.7z`);
    await baixarComCurl(`${CAGED_FTP}${ano}/${mes}/CAGEDMOV${mes}.7z`, ['-o', arquivo]);
    await executar(extratorDeArquivo(), argumentosDeExtracao(arquivo, pastaDeTrabalho), { maxBuffer: 1024 * 1024 });
    const arquivoTxt = (await readdir(pastaDeTrabalho)).find(f => /\.txt$/i.test(f));
    if (!arquivoTxt) throw new Error('Arquivo CAGEDMOV sem .txt após extração');
    const agregado = agregadoVazio();
    for await (const linha of createInterface({ input: createReadStream(path.join(pastaDeTrabalho, arquivoTxt), { encoding: 'utf8' }), crlfDelay: Infinity })) somarLinha(agregado, linha, mes);
    if (agregado.brasil.admissions + agregado.brasil.dismissals < 100000) throw new Error('Totais do CAGED implausíveis; arquivo possivelmente incompleto');
    return agregado;
  } finally { await rm(pastaDeTrabalho, { recursive: true, force: true }); }
}
const SERIES_DO_CAGED: [keyof Agregado, string, string][] = [
  ['brasil', 'caged.saldo', 'Saldo de emprego formal — Brasil'],
  ['sp', 'caged.saldo-sp', 'Saldo de emprego formal — São Paulo'],
  ['servicos', 'caged.saldo-servicos', 'Saldo — serviços administrativos e complementares (seção N)'],
  ['temporario', 'caged.saldo-temporario', 'Saldo — locação de mão de obra temporária (CNAE 7820-5)'],
];
function publicar(db: BancoDeDados) {
  for (const [, id, rotulo] of SERIES_DO_CAGED) {
    const serie = lerSerie(db, id); const ultimo = serie.at(-1); if (!ultimo) continue;
    gravarIndicador(db, { id, source: 'caged', group: 'Emprego formal', label: rotulo, value: ultimo.value, unit: 'vagas no mês', period: rotuloDoMes(ultimo.period), previous: serie.at(-2)?.value, url: PAGINA_DO_CAGED });
  }
}
const UMA_HORA_MS = 60 * 60 * 1000;

export const caged: Coletor = {
  source: 'caged', label: 'CAGED (Ministério do Trabalho)',
  async run({ db, full }) {
    // O MTE publica uma vez por mês; verificar o FTP a cada ciclo só custa uma listagem pequena, mas limitamos a 1 hora.
    const ultimaVerificacao = lerEstado(db, 'caged:check');
    if (!full && ultimaVerificacao && Date.now() - Date.parse(ultimaVerificacao.updatedAt) < UMA_HORA_MS) { publicar(db); return { fetched: 0, changed: 0 }; }
    let buscados = 0; let alterados = 0;
    const anos = (await listar(CAGED_FTP)).map(l => l.match(/<DIR>\s+(20\d{2})$/)?.[1]).filter((y): y is string => Boolean(y)).sort(); buscados++;
    const candidatas: { year: string; month: string }[] = [];
    for (const ano of anos.slice(-3).reverse()) {
      const meses = (await listar(`${CAGED_FTP}${ano}/`)).map(l => l.match(/<DIR>\s+(\d{6})$/)?.[1]).filter((m): m is string => Boolean(m)).sort().reverse(); buscados++;
      candidatas.push(...meses.map(mes => ({ year: ano, month: mes })));
    }
    for (const { year: ano, month: mes } of candidatas.slice(0, full ? 24 : 3)) {
      const arquivos = await listar(`${CAGED_FTP}${ano}/${mes}/`); buscados++;
      const tamanho = arquivos.find(l => l.includes(`CAGEDMOV${mes}.7z`))?.match(/\s(\d+)\s+CAGEDMOV/)?.[1];
      if (!tamanho) continue;
      const conhecido = lerEstado(db, `caged:size:${mes}`)?.value;
      if (conhecido === tamanho && lerSerie(db, 'caged.saldo').some(p => p.period === mes)) continue; // inalterado desde a última coleta
      const agregado = await agregarMes(ano, mes); buscados++;
      for (const [key, id] of SERIES_DO_CAGED) gravarSerie(db, id, mes, saldoLiquido(agregado[key]));
      gravarSerie(db, 'caged.saldo-temporario-sp', mes, saldoLiquido(agregado.temporarioSp)); gravarSerie(db, 'caged.saldo-servicos-sp', mes, saldoLiquido(agregado.servicosSp));
      const formatar = numeroBR;
      const linha = (nome: string, t: Totais) => `${nome}: ${formatar(t.admissions)} admissões, ${formatar(t.dismissals)} desligamentos, saldo ${formatar(saldoLiquido(t))}.`;
      const conteudo = [`Novo CAGED — competência ${rotuloDoMes(mes)} (arquivo CAGEDMOV, base do número divulgado pelo Ministério no mês; declarações fora do prazo e exclusões posteriores não são aplicadas).`,
        linha('Brasil', agregado.brasil), linha('São Paulo', agregado.sp), linha('Serviços administrativos e complementares (seção N), Brasil', agregado.servicos), linha('Serviços administrativos e complementares (seção N), São Paulo', agregado.servicosSp),
        linha('Locação de mão de obra temporária (CNAE 7820-5), Brasil', agregado.temporario), linha('Locação de mão de obra temporária (CNAE 7820-5), São Paulo', agregado.temporarioSp)].join('\n');
      if (gravarDocumento(db, { source: 'caged', url: `${CAGED_FTP}${ano}/${mes}/`, title: `Novo CAGED — ${rotuloDoMes(mes)}`, content: conteudo, publishedAt: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(4)) , 1)).toISOString(), meta: { month: mes } })) alterados++;
      gravarEstado(db, `caged:size:${mes}`, tamanho);
    }
    gravarEstado(db, 'caged:check', new Date().toISOString());
    publicar(db);
    return { fetched: buscados, changed: alterados };
  },
};
