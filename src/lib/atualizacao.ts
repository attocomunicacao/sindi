import { spawn } from 'node:child_process';
import path from 'node:path';

/** Estado em memória da última atualização das bibliotecas (notícias, leis, relatórios...). Sem conteúdo de conversas. */
export type EstadoAtualizacao = {
  rodando: boolean;
  completa: boolean;
  inicio?: string;
  fim?: string;
  codigo?: number | null;
  linhas: string[];
};
const g = globalThis as unknown as { __sindiAtualizacao?: EstadoAtualizacao };
const estado = (): EstadoAtualizacao => (g.__sindiAtualizacao ??= { rodando: false, completa: false, linhas: [] });
export const estadoAtualizacao = (): EstadoAtualizacao => ({ ...estado(), linhas: [...estado().linhas] });

/** Só a própria máquina pode iniciar: o endereço público não tem login, e o Host vem do túnel, nunca do navegador do visitante. */
export function hostLocal(host: string | null): boolean {
  const nome = (host ?? '')
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  return nome === 'localhost' || nome === '127.0.0.1' || nome === '::1';
}

/** Cabeçalhos que Cloudflare (túnel), Vercel e demais repasses acrescentam. Um navegador abrindo http://localhost direto no computador nunca os traz. */
const CABECALHOS_DE_REPASSE = [
  'x-real-ip',
  'forwarded',
  'cf-connecting-ip',
  'cf-ray',
  'x-vercel-forwarded-for',
  'x-vercel-id',
];
const LOOPBACK = /^(127(\.\d{1,3}){3}|::1|::ffff:127(\.\d{1,3}){3}|localhost)$/i;
/**
 * Pedido feito no próprio computador: Host local e nenhum sinal de repasse. O Host sozinho não basta (um repasse pode reescrevê-lo). O próprio Next acrescenta
 * `x-forwarded-for` até em acesso local (com o endereço de loopback), por isso esse cabeçalho só indica repasse quando traz um endereço que não é de loopback.
 */
export function pedidoLocal(request: Request): boolean {
  if (
    !hostLocal(request.headers.get('host')) ||
    process.env.VERCEL ||
    CABECALHOS_DE_REPASSE.some((nome) => request.headers.has(nome))
  )
    return false;
  const encaminhado = request.headers.get('x-forwarded-for');
  return !encaminhado || encaminhado.split(',').every((ip) => LOOPBACK.test(ip.trim()));
}

/** Executa a mesma coleta do comando `npm run dados:sync` (coleta, planilha, cérebro e índice de busca) em segundo plano. */
export function iniciarAtualizacao(completa: boolean): { ok: boolean; motivo?: string } {
  const e = estado();
  if (e.rodando) return { ok: false, motivo: 'Já existe uma atualização em andamento.' };
  Object.assign(e, {
    rodando: true,
    completa,
    inicio: new Date().toISOString(),
    fim: undefined,
    codigo: undefined,
    linhas: [],
  });
  const tsx = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const filho = spawn(process.execPath, [tsx, 'scripts/dados/dados-sync.ts', ...(completa ? ['--full'] : [])], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const guardar = (b: Buffer) => {
    for (const l of b.toString('utf8').split(/\r?\n/))
      if (l.trim()) {
        e.linhas.push(l.slice(0, 300));
        if (e.linhas.length > 40) e.linhas.shift();
      }
  };
  filho.stdout.on('data', guardar);
  filho.stderr.on('data', guardar);
  const fechar = (codigo: number | null) => {
    if (!e.rodando) return;
    Object.assign(e, { rodando: false, fim: new Date().toISOString(), codigo });
  };
  filho.on('error', () => {
    e.linhas.push('Não foi possível iniciar a coleta.');
    fechar(-1);
  });
  filho.on('close', fechar);
  return { ok: true };
}
