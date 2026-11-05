import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../dados/db';
import { avaliarCasos, carregarCasos, type ResultadoCaso } from './avaliar';
import { pastaCerebro, reiniciarCacheDoCerebro } from './carregar';
import { gerarArquivos } from './gerar';

/** Tamanho mínimo plausível de cada arquivo gerado: um arquivo vazio ou muito menor indica que a coleta falhou. */
export const MINIMOS: Record<string, number> = { 'institucional.md': 2500, 'contribuicoes.md': 1500, 'convencoes.md': 8000, 'juridico.md': 800, 'cartilhas.md': 1500, 'artigos-e-noticias.md': 4000, 'fontes-de-dados.md': 1500 };
export type Dependencias = { gerar: (db: Db) => Record<string, string>; avaliar: () => Promise<ResultadoCaso[]> };
export type Resultado = { publicado: boolean; motivo: string };

/** Compara o conteúdo sem a data de geração, para não republicar (nem reavaliar) quando nada mudou. */
const semData = (texto: string) => texto.replace(/^atualizado: .*$/m, '').replace(/AUTOGERADO por .* em \d{4}-\d{2}-\d{2}/, '');
const lerAtual = (pasta: string, arquivo: string) => { try { return readFileSync(path.join(pasta, arquivo), 'utf8'); } catch { return ''; } };

/**
 * Regenera os arquivos autogerados do cérebro com proteção: (1) valida o tamanho de cada arquivo; (2) só avalia se algo mudou;
 * (3) grava, reavalia as perguntas de ouro e, se alguma que passava passou a falhar, restaura os arquivos anteriores.
 */
export async function publicarCerebro(db: Db, log: (mensagem: string) => void = () => {},
  deps: Dependencias = { gerar: gerarArquivos, avaliar: () => avaliarCasos(carregarCasos()) }): Promise<Resultado> {
  const novos = deps.gerar(db); const pasta = path.join(pastaCerebro(), 'auto'); const anterior = path.join(pastaCerebro(), 'auto.anterior');
  for (const [arquivo, minimo] of Object.entries(MINIMOS)) {
    if ((novos[arquivo]?.length ?? 0) < minimo) { log(`Cérebro: ${arquivo} gerado com ${novos[arquivo]?.length ?? 0} caracteres (mínimo ${minimo}); arquivos anteriores mantidos`); return { publicado: false, motivo: `${arquivo} abaixo do mínimo` }; }
  }
  const mudados = Object.entries(novos).filter(([arquivo, texto]) => semData(texto) !== semData(lerAtual(pasta, arquivo)));
  if (!mudados.length) return { publicado: false, motivo: 'sem mudanças' };
  const antes = await deps.avaliar();
  rmSync(anterior, { recursive: true, force: true });
  if (existsSync(pasta)) cpSync(pasta, anterior, { recursive: true }); mkdirSync(pasta, { recursive: true });
  for (const [arquivo, texto] of mudados) { const temporario = path.join(pasta, arquivo + '.tmp'); writeFileSync(temporario, texto, 'utf8'); renameSync(temporario, path.join(pasta, arquivo)); }
  reiniciarCacheDoCerebro();
  const depois = await deps.avaliar();
  const regrediram = depois.filter(r => !r.ok && antes.find(a => a.pergunta === r.pergunta)?.ok);
  if (regrediram.length) {
    rmSync(pasta, { recursive: true, force: true }); renameSync(anterior, pasta); reiniciarCacheDoCerebro();
    log(`Cérebro: a nova versão piorou ${regrediram.length} pergunta(s) de ouro (${regrediram.map(r => r.pergunta).join('; ')}); versão anterior restaurada`);
    return { publicado: false, motivo: 'regressão na avaliação' };
  }
  log(`Cérebro atualizado: ${mudados.map(([a]) => a).join(', ')} · avaliação ${depois.filter(r => r.ok).length}/${depois.length}`);
  return { publicado: true, motivo: `${mudados.length} arquivo(s) atualizado(s)` };
}
