// Desenho do grafo em Canvas 2D próprio: compatível com a CSP (nada de `style=` no servidor, nenhum worker) e leve com milhares de nós
// (ligações desenhadas em lote, nós fora da tela ignorados). Estado e geometria vêm de layout-do-grafo.ts.
import { LEGENDA } from '@/lib/grafo/tipos';
import { ehCentral, type Ajustes, type LigSim, type Modo, type NoSim, type Vista } from '@/componentes/cerebro/layout-do-grafo';

// Paleta do tema escuro do Obsidian.
const FUNDO = '#1e1e1e';
const NO_NEUTRO = '#9e9e9e';
const LINHA = 'rgba(120,120,120,0.35)';
const ACENTO = '#a882ff';
const TEXTO = '#dadada';

/** Tudo o que o desenho e a interação leem e escrevem a cada quadro; vive numa ref para não provocar renderização do React. */
export type EstadoDoGrafo = {
  vista: Vista; alvo: Vista; sobre?: NoSim; esmaecer: number;
  nos: NoSim[]; ligacoes: LigSim[]; vizinhos: Map<string, Set<string>>; destaque: Set<string>;
  ajustes: Ajustes; selecionado?: NoSim;
  /** Quantos nós já "apareceram" na animação da linha do tempo (Infinity = todos). */
  revelados: number;
  grande: boolean; arrastando: boolean; quadro: number; modo: Modo; reduzir: boolean;
};

export const estadoInicialDoGrafo = (ajustes: Ajustes): EstadoDoGrafo => ({
  vista: { k: 1, x: 0, y: 0 }, alvo: { k: 1, x: 0, y: 0 }, sobre: undefined, esmaecer: 0,
  nos: [], ligacoes: [], vizinhos: new Map(), destaque: new Set(),
  ajustes, selecionado: undefined, revelados: Infinity, grande: false, arrastando: false, quadro: 0, modo: 'rede', reduzir: false,
});

/** O que muda de um quadro para o outro: a vista já interpolada, o nó em foco e seus vizinhos, e o tamanho da tela. */
type Quadro = { e: EstadoDoGrafo; k: number; x: number; y: number; w: number; h: number; foco?: NoSim; perto?: Set<string> };

const posicao = (n: NoSim) => [n.x ?? 0, n.y ?? 0] as const;
const naTela = (q: Quadro, n: NoSim) => { const sx = (n.x ?? 0) * q.k + q.x; const sy = (n.y ?? 0) * q.k + q.y; return sx > -60 && sx < q.w + 60 && sy > -60 && sy < q.h + 60; };
const revelado = (q: Quadro, n: NoSim) => n.ordem < q.e.revelados;
const emFoco = (q: Quadro, n: NoSim) => !q.foco || n.id === q.foco.id || Boolean(q.perto?.has(n.id));
const ehOFoco = (q: Quadro, n: NoSim) => Boolean(q.foco) && n.id === q.foco!.id;
const corDoNo = (e: EstadoDoGrafo, n: NoSim) => (e.ajustes.cores ? LEGENDA[n.tipo].cor : NO_NEUTRO);

/** Dimensiona o canvas para a tela (com a densidade de pixels) e devolve o tamanho em pixels CSS. */
function ajustarTamanho(c: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth; const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  return { dpr, w, h };
}

/** Zoom e deslocamento suaves (interpolação até o alvo), esmaecimento ao focar e a revelação da animação em linha do tempo. */
function avancarAnimacao(e: EstadoDoGrafo) {
  const suave = e.reduzir ? 1 : 0.22;
  const v = e.vista; const a = e.alvo;
  v.k += (a.k - v.k) * suave; v.x += (a.x - v.x) * suave; v.y += (a.y - v.y) * suave;
  const foco = e.sobre ?? e.selecionado;
  e.esmaecer += ((foco ? 1 : 0) - e.esmaecer) * (e.reduzir ? 1 : 0.18);
  if (e.revelados < e.nos.length) e.revelados += Math.max(1, e.nos.length / 260);
  return foco;
}

/** Ligações em dois lotes: as comuns (esmaecidas quando há foco) e as do nó em foco (cor de destaque). Devolve as do foco, para as setas. */
function desenharLigacoes(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e, foco } = q;
  const largura = (e.ajustes.espessura * 0.9) / Math.max(q.k, 0.4);
  ctx.lineWidth = largura; ctx.strokeStyle = LINHA; ctx.globalAlpha = 1 - 0.75 * e.esmaecer; ctx.beginPath();
  const doFoco: LigSim[] = [];
  for (const l of e.ligacoes) {
    const s = l.source as NoSim; const t = l.target as NoSim;
    if (!revelado(q, s) || !revelado(q, t)) continue;
    if (foco && (s.id === foco.id || t.id === foco.id)) { doFoco.push(l); continue; }
    ctx.moveTo(...posicao(s)); ctx.lineTo(...posicao(t));
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  if (doFoco.length) {
    ctx.strokeStyle = ACENTO; ctx.lineWidth = largura * 1.8; ctx.beginPath();
    for (const l of doFoco) { ctx.moveTo(...posicao(l.source as NoSim)); ctx.lineTo(...posicao(l.target as NoSim)); }
    ctx.stroke();
  }
  return doFoco;
}

/** Setas (no fim de cada ligação), como a opção "Arrows" do Obsidian. */
function desenharSetas(ctx: CanvasRenderingContext2D, q: Quadro, doFoco: LigSim[]) {
  const { e, foco } = q;
  ctx.fillStyle = foco ? ACENTO : 'rgba(150,150,150,0.6)';
  for (const l of foco ? doFoco : e.ligacoes.length < 4000 ? e.ligacoes : []) {
    const s = l.source as NoSim; const t = l.target as NoSim;
    if (!revelado(q, s) || !revelado(q, t)) continue;
    const ang = Math.atan2((t.y ?? 0) - (s.y ?? 0), (t.x ?? 0) - (s.x ?? 0));
    const recuo = t.r * e.ajustes.tamanho + 1.5; const tam = 4 / Math.max(q.k, 0.5);
    const px = (t.x ?? 0) - Math.cos(ang) * recuo; const py = (t.y ?? 0) - Math.sin(ang) * recuo;
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang - 0.45) * tam, py - Math.sin(ang - 0.45) * tam);
    ctx.lineTo(px - Math.cos(ang + 0.45) * tam, py - Math.sin(ang + 0.45) * tam);
    ctx.fill();
  }
}

type LoteDeNos = { cor: string; alfa: number; nos: { x: number; y: number; r: number }[] };

/** Nós em lote: um traçado por cor e por estado (ativo/esmaecido), em vez de um preenchimento por nó — com milhares de nós, é o que mantém a fluidez. */
function desenharNos(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e } = q;
  const lotes = new Map<string, LoteDeNos>();
  const especiais: NoSim[] = [];
  const alfaApagado = 1 - 0.85 * e.esmaecer;
  for (const n of e.nos) {
    if (!revelado(q, n) || !naTela(q, n)) continue;
    if (ehOFoco(q, n) || e.destaque.has(n.id)) { especiais.push(n); continue; }
    const cor = corDoNo(e, n); const alfa = emFoco(q, n) ? 1 : alfaApagado; const chave = `${cor}|${alfa}`;
    (lotes.get(chave) ?? lotes.set(chave, { cor, alfa, nos: [] }).get(chave)!).nos.push({ x: n.x ?? 0, y: n.y ?? 0, r: n.r * e.ajustes.tamanho });
  }
  for (const lote of lotes.values()) {
    ctx.globalAlpha = lote.alfa; ctx.fillStyle = lote.cor; ctx.beginPath();
    for (const p of lote.nos) { ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const n of especiais) desenharNoEspecial(ctx, q, n);
}

/** Nó em foco (com halo) ou achado pela busca (maior e com contorno branco). */
function desenharNoEspecial(ctx: CanvasRenderingContext2D, q: Quadro, n: NoSim) {
  const { e } = q;
  const noFoco = ehOFoco(q, n); const achado = e.destaque.has(n.id);
  const r = n.r * e.ajustes.tamanho * (achado ? 1.6 : 1) * (noFoco ? 1.25 : 1);
  const [x, y] = posicao(n);
  if (noFoco) { ctx.fillStyle = 'rgba(168,130,255,0.25)'; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = noFoco ? ACENTO : corDoNo(e, n);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (achado) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 / q.k; ctx.stroke(); }
}

/** Rótulos: aparecem gradualmente conforme o zoom ("Text fade threshold"); os do nó em foco e dos vizinhos aparecem sempre. */
function desenharRotulos(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e, k, foco } = q;
  const limiar = 1.1 * Math.pow(2, e.ajustes.limiarTexto);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = TEXTO;
  // A fonte só muda entre os dois estilos (trocar `ctx.font` a cada rótulo é caro).
  const fonteCentral = `600 ${13 / k}px ui-sans-serif, system-ui, sans-serif`;
  const fonteComum = `${11 / k}px ui-sans-serif, system-ui, sans-serif`;
  let fonteAtual = '';
  for (const n of e.nos) {
    const forcado = (foco && emFoco(q, n)) || e.destaque.has(n.id) || e.modo === 'arquitetura';
    const base = ehCentral(n) ? limiar * 0.22 : n.tipo === 'documento' ? limiar * 1.6 : limiar * 0.75;
    // Teste barato primeiro: sem zoom suficiente e sem foco, o rótulo nem é considerado.
    if (!forcado && k <= base) continue;
    if (!revelado(q, n) || !naTela(q, n)) continue;
    let alfa = forcado ? 1 : Math.min(1, Math.max(0, (k - base) / (base * 0.6)));
    if (foco && !emFoco(q, n)) alfa *= 1 - 0.9 * e.esmaecer;
    if (alfa < 0.03) continue;
    const fonte = ehCentral(n) ? fonteCentral : fonteComum;
    if (fonte !== fonteAtual) { ctx.font = fonte; fonteAtual = fonte; }
    ctx.globalAlpha = alfa;
    const texto = n.rotulo.length > 52 ? `${n.rotulo.slice(0, 50)}…` : n.rotulo;
    ctx.fillText(texto, n.x ?? 0, (n.y ?? 0) + n.r * e.ajustes.tamanho + 3 / k);
  }
  ctx.globalAlpha = 1;
}

/** Há mais quadros a desenhar? (zoom ainda se movendo, esmaecimento, animação da linha do tempo ou arraste). */
function precisaDeOutroQuadro(e: EstadoDoGrafo, foco: NoSim | undefined) {
  const { vista: v, alvo: a } = e;
  const movendo = Math.abs(a.k - v.k) > 1e-3 * a.k || Math.abs(a.x - v.x) > 0.3 || Math.abs(a.y - v.y) > 0.3;
  const esmaecendo = Math.abs((foco ? 1 : 0) - e.esmaecer) > 0.01;
  return movendo || esmaecendo || e.revelados < e.nos.length || e.arrastando;
}

/** Desenha um quadro e diz se é preciso pedir outro. */
export function desenharQuadro(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, e: EstadoDoGrafo) {
  const { dpr, w, h } = ajustarTamanho(c);
  const foco = avancarAnimacao(e);
  const { k, x, y } = e.vista;
  const q: Quadro = { e, k, x, y, w, h, foco, perto: foco ? e.vizinhos.get(foco.id) : undefined };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = FUNDO; ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
  const doFoco = desenharLigacoes(ctx, q);
  if (e.ajustes.setas) desenharSetas(ctx, q, doFoco);
  desenharNos(ctx, q);
  desenharRotulos(ctx, q);
  return precisaDeOutroQuadro(e, foco);
}
