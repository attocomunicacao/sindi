import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type Trecho = {
  /** Arquivo de origem, relativo à pasta cerebro (ex.: "auto/convencoes.md"). */
  arquivo: string; titulo: string; secao: string; texto: string; fonte?: string; atualizado?: string; gatilhos: string[]; tipo: 'curado' | 'autogerado'; prioridade: number;
  /** Seção de perguntas e respostas curadas: quando a pergunta do usuário é equivalente, a resposta é devolvida sem passar pelo modelo. */
  direta: boolean;
  /** Falso em arquivos "meta" (regras, limites): não entram na busca por significado, para não atrair perguntas que só citam o sindicato ou a SINDI. */
  semantica: boolean;
};
export type Cabecalho = { titulo?: string; fonte?: string; atualizado?: string; gatilhos: string[]; tipo: 'curado' | 'autogerado'; prioridade: number; direta: boolean; semantica: boolean };

export const pastaCerebro = () => path.resolve(/*turbopackIgnore: true*/ process.env.SINDI_CEREBRO_DIR || 'cerebro');
/** Arquivos que explicam o cérebro, guardam a avaliação, instruem o modelo (instrucoes/) ou roteiam a pergunta (conectores/) não viram conhecimento. */
const IGNORADOS = /(^|\/)(README\.md|avaliacao\/|instrucoes\/|conectores\/)/i;
const TAMANHO_MAXIMO = 1700;

/** Cabeçalho simples (subconjunto de YAML): `chave: valor`, com `gatilhos:` separados por vírgula. */
export function lerCabecalho(markdown: string): { cabecalho: Cabecalho; corpo: string } {
  const vazio: Cabecalho = { gatilhos: [], tipo: 'curado', prioridade: 1, direta: false, semantica: true };
  const m = markdown.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { cabecalho: vazio, corpo: markdown.replace(/\r\n/g, '\n') };
  const cabecalho: Cabecalho = { ...vazio };
  for (const linha of m[1].split('\n')) {
    const par = linha.match(/^([a-zA-Z_]+):\s*(.*)$/); if (!par) continue;
    const valor = par[2].trim().replace(/^["']|["']$/g, '');
    if (par[1] === 'titulo') cabecalho.titulo = valor; else if (par[1] === 'fonte') cabecalho.fonte = valor; else if (par[1] === 'atualizado') cabecalho.atualizado = valor;
    else if (par[1] === 'gatilhos') cabecalho.gatilhos = valor.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean);
    else if (par[1] === 'tipo') cabecalho.tipo = valor === 'autogerado' ? 'autogerado' : 'curado';
    else if (par[1] === 'semantica') cabecalho.semantica = !/^(nao|não|false|0)$/i.test(valor);
    else if (par[1] === 'direta') cabecalho.direta = /^(sim|true|1)$/i.test(valor);
    else if (par[1] === 'prioridade') cabecalho.prioridade = Math.max(0.5, Math.min(3, Number(valor) || 1));
  }
  return { cabecalho, corpo: m[2] };
}
/**
 * Divide o texto por seções (`##`). Tabelas e listas ficam inteiras; seções longas são quebradas por parágrafo,
 * repetindo o título da seção em cada pedaço para que cada trecho faça sentido sozinho.
 */
export function dividirEmTrechos(corpo: string, arquivo: string, cabecalho: Cabecalho): Trecho[] {
  const partes = corpo.split(/^## +/m); const titulo = cabecalho.titulo ?? path.basename(arquivo, '.md');
  const trechos: Trecho[] = [];
  const novo = (secao: string, texto: string): Trecho => ({ arquivo, titulo, secao, texto: texto.trim(), fonte: cabecalho.fonte, atualizado: cabecalho.atualizado, gatilhos: cabecalho.gatilhos, tipo: cabecalho.tipo, prioridade: cabecalho.prioridade, direta: cabecalho.direta, semantica: cabecalho.semantica });
  partes.forEach((parte, indice) => {
    if (!parte.trim()) return;
    const quebra = parte.indexOf('\n'); const secao = indice === 0 && !corpo.startsWith('## ') ? titulo : (quebra < 0 ? parte : parte.slice(0, quebra)).trim();
    const texto = indice === 0 && !corpo.startsWith('## ') ? parte : (quebra < 0 ? '' : parte.slice(quebra + 1));
    // Introdução sem conteúdo (só o título "# ...") não vira trecho.
    if (texto.replace(/^\s*# .*$/gm, '').trim().length < 40 && indice === 0) return;
    if (!texto.trim()) return;
    if (texto.length <= TAMANHO_MAXIMO) { trechos.push(novo(secao, texto)); return; }
    let atual = '';
    for (const bloco of texto.split(/\n{2,}/)) {
      if (atual && (atual + '\n\n' + bloco).length > TAMANHO_MAXIMO) { trechos.push(novo(secao, atual)); atual = ''; }
      atual = atual ? `${atual}\n\n${bloco}` : bloco;
      while (atual.length > TAMANHO_MAXIMO * 1.5) { const corte = atual.lastIndexOf('\n', TAMANHO_MAXIMO); const ponto = corte > 200 ? corte : TAMANHO_MAXIMO; trechos.push(novo(secao, atual.slice(0, ponto))); atual = atual.slice(ponto).trim(); }
    }
    if (atual.trim()) trechos.push(novo(secao, atual));
  });
  return trechos;
}
function listar(pasta: string, base = pasta): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap(e => e.isDirectory() ? listar(path.join(pasta, e.name), base) : e.name.endsWith('.md') ? [path.relative(base, path.join(pasta, e.name)).replace(/\\/g, '/')] : []);
}
export function carregarArquivos(pasta = pastaCerebro()): { trechos: Trecho[]; arquivos: string[] } {
  let arquivos: string[] = [];
  try { arquivos = listar(pasta).filter(a => !IGNORADOS.test(a)).sort(); } catch { return { trechos: [], arquivos: [] }; }
  const trechos = arquivos.flatMap(arquivo => {
    const { cabecalho, corpo } = lerCabecalho(readFileSync(path.join(pasta, arquivo), 'utf8'));
    return dividirEmTrechos(corpo, arquivo, cabecalho);
  });
  return { trechos, arquivos };
}
let cache: { chave: string; trechos: Trecho[]; verificadoEm: number } | undefined;
/** Os arquivos são relidos quando mudam (conferência por data de modificação, no máximo a cada 5 s). */
export function trechosDoCerebro(pasta = pastaCerebro()): Trecho[] {
  if (cache && Date.now() - cache.verificadoEm < 5000) return cache.trechos;
  let chave = '';
  try { chave = listar(pasta).filter(a => !IGNORADOS.test(a)).map(a => `${a}:${statSync(path.join(pasta, a)).mtimeMs}`).join('|'); } catch { cache = { chave: '', trechos: [], verificadoEm: Date.now() }; return []; }
  if (cache && cache.chave === chave) { cache.verificadoEm = Date.now(); return cache.trechos; }
  cache = { chave, trechos: carregarArquivos(pasta).trechos, verificadoEm: Date.now() };
  return cache.trechos;
}

let cacheRegras: { mtime: number; texto: string; verificadoEm: number } | undefined;
export const ARQUIVO_REGRAS = 'instrucoes/identidade-e-regras.md';
/** Texto do arquivo de identidade e regras, que complementa as instruções-base do modelo (limitado, para caber no contexto de um modelo pequeno). */
export function regrasDoCerebro(pasta = pastaCerebro(), limite = 2600): string {
  if (cacheRegras && Date.now() - cacheRegras.verificadoEm < 5000) return cacheRegras.texto;
  const arquivo = path.join(pasta, ARQUIVO_REGRAS);
  try {
    const mtime = statSync(arquivo).mtimeMs;
    if (cacheRegras && cacheRegras.mtime === mtime) { cacheRegras.verificadoEm = Date.now(); return cacheRegras.texto; }
    const { corpo } = lerCabecalho(readFileSync(arquivo, 'utf8'));
    const texto = corpo.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*# .*\n/, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, limite);
    cacheRegras = { mtime, texto, verificadoEm: Date.now() }; return texto;
  } catch { cacheRegras = { mtime: 0, texto: '', verificadoEm: Date.now() }; return ''; }
}

/** Esquece o que foi lido (usado após publicar novos arquivos, para a próxima busca já enxergá-los). */
export function reiniciarCacheDoCerebro() { cache = undefined; cacheRegras = undefined; }
