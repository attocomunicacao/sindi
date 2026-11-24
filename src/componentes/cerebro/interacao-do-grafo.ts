// Interação do grafo: arrastar nó (a física puxa os vizinhos), arrastar o fundo, roda e pinça (zoom), clique, duplo clique e teclado. O mouse só
// procura o nó sob o cursor uma vez por quadro, para não varrer a lista a cada movimento.
import type { RefObject } from 'react';
import { noVisivel, type EstadoDoGrafo } from '@/componentes/cerebro/desenho-do-grafo';
import { ordenarVizinhos, type NoSim, type SimulacaoDoGrafo } from '@/componentes/cerebro/layout-do-grafo';

const ZOOM_MINIMO = 0.03;
const ZOOM_MAXIMO = 12;
/** Deslocamento (px) a partir do qual um arraste do fundo deixa de contar como clique. */
const TOLERANCIA_DO_CLIQUE = 3;
/** Folga (px) em volta do nó em que o toque ainda o acerta: dedo é mais largo que o cursor. */
const FOLGA_DO_MOUSE = 5;
const FOLGA_DO_TOQUE = 14;

type Gesto =
  | { tipo: 'no'; no: NoSim; moveu: boolean }
  | { tipo: 'fundo'; x: number; y: number; vx: number; vy: number; moveu: boolean }
  | { tipo: 'pinca'; distancia: number; k: number; x: number; y: number; cx: number; cy: number };

type Ligacoes = {
  estado: EstadoDoGrafo;
  simulacao: RefObject<SimulacaoDoGrafo | undefined>;
  /** Pede o próximo quadro de desenho. */
  acordar: RefObject<() => void>;
  aoSelecionar: (no: NoSim | undefined) => void;
  /** Leva a vista até o nó (teclado). */
  aoCentrar: (no: NoSim) => void;
  aoAbrir: (endereco: string) => void;
};

/** O que os handlers compartilham: o canvas, as ligações com o resto do hook, o gesto em andamento e o que falta processar do mouse. */
type Contexto = Ligacoes & {
  c: HTMLCanvasElement;
  gesto?: Gesto;
  ponteiros: Map<number, { x: number; y: number }>;
  pendente?: { x: number; y: number };
  agendado: boolean;
  teclado: number;
};

const mundo = (e: EstadoDoGrafo, px: number, py: number) =>
  [(px - e.vista.x) / e.vista.k, (py - e.vista.y) / e.vista.k] as const;

/** Posição do ponteiro em relação ao canvas. */
function ponto(c: HTMLCanvasElement, ev: PointerEvent | WheelEvent | MouseEvent) {
  const r = c.getBoundingClientRect();
  return [ev.clientX - r.left, ev.clientY - r.top] as const;
}

/** O nó mais próximo do ponto (já revelado, visível e dentro do alcance), se houver. */
export function noEm(e: EstadoDoGrafo, px: number, py: number, folga = FOLGA_DO_MOUSE) {
  const [gx, gy] = mundo(e, px, py);
  let melhor: NoSim | undefined;
  let distancia = Infinity;
  for (const n of e.nos) {
    if (n.ordem >= e.revelados || !noVisivel(e, n)) continue;
    const d = ((n.x ?? 0) - gx) ** 2 + ((n.y ?? 0) - gy) ** 2;
    const alcance = (n.r * e.ajustes.tamanho + folga / e.vista.k) ** 2;
    if (d < alcance && d < distancia) {
      melhor = n;
      distancia = d;
    }
  }
  return melhor;
}

/** Pressionar sobre um nó da rede o fixa para arrastar; sobre documento ou fora de nó, começa o arraste do fundo (o documento só é selecionado). */
function aoPressionar(ctx: Contexto, ev: PointerEvent) {
  const { c, estado: e, simulacao } = ctx;
  const [px, py] = ponto(c, ev);
  ctx.ponteiros.set(ev.pointerId, { x: px, y: py });
  c.setPointerCapture(ev.pointerId);
  if (ctx.ponteiros.size === 2) return iniciarPinca(ctx);
  const n = noEm(e, px, py, ev.pointerType === 'touch' ? FOLGA_DO_TOQUE : FOLGA_DO_MOUSE);
  if (n && n.tipo !== 'documento') {
    ctx.gesto = { tipo: 'no', no: n, moveu: false };
    n.fx = n.x;
    n.fy = n.y;
    e.arrastando = true;
    simulacao.current?.alphaTarget(e.grande ? 0.08 : 0.25).restart();
  } else ctx.gesto = { tipo: 'fundo', x: px, y: py, vx: e.alvo.x, vy: e.alvo.y, moveu: false };
}

/** Dois dedos: guarda a distância e o ponto médio para o zoom por pinça. */
function iniciarPinca(ctx: Contexto) {
  const [a, b] = [...ctx.ponteiros.values()];
  const e = ctx.estado;
  if (ctx.gesto?.tipo === 'no') {
    // O nó que estava sendo arrastado volta à física: o segundo dedo mudou o gesto.
    if (e.modo !== 'arquitetura') {
      ctx.gesto.no.fx = null;
      ctx.gesto.no.fy = null;
    }
    e.arrastando = false;
    ctx.simulacao.current?.alphaTarget(0);
  }
  ctx.gesto = {
    tipo: 'pinca',
    distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    k: e.alvo.k,
    x: e.alvo.x,
    y: e.alvo.y,
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
  };
}

function moverPinca(ctx: Contexto, g: Extract<Gesto, { tipo: 'pinca' }>) {
  const [a, b] = [...ctx.ponteiros.values()];
  if (!a || !b) return;
  const e = ctx.estado;
  const novo = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, (g.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.distancia));
  // O ponto sob o centro da pinça fica no mesmo lugar do mundo; o centro que anda também arrasta a vista.
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  e.alvo = { k: novo, x: cx - ((g.cx - g.x) * novo) / g.k, y: cy - ((g.cy - g.y) * novo) / g.k };
  e.vista = { ...e.alvo };
  ctx.acordar.current();
}

function arrastarFundo(e: EstadoDoGrafo, g: Extract<Gesto, { tipo: 'fundo' }>, px: number, py: number) {
  const dx = px - g.x;
  const dy = py - g.y;
  if (Math.abs(dx) + Math.abs(dy) > TOLERANCIA_DO_CLIQUE) g.moveu = true;
  e.alvo = { ...e.alvo, x: g.vx + dx, y: g.vy + dy };
  e.vista = { ...e.vista, x: e.alvo.x, y: e.alvo.y };
}

/** Procura o nó sob o ponteiro (uma vez por quadro) e atualiza o foco. */
function processarPendente(ctx: Contexto) {
  ctx.agendado = false;
  const { c, estado: e, acordar, pendente } = ctx;
  if (!pendente || ctx.gesto) return;
  const n = noEm(e, pendente.x, pendente.y);
  if (n !== e.sobre) {
    e.sobre = n;
    c.classList.toggle('cursor-pointer', Boolean(n));
  }
  acordar.current();
}

/** Arrasta o nó ou o fundo; sem gesto, só acompanha qual nó está sob o cursor (a busca do nó fica para o próximo quadro). */
function aoMoverPonteiro(ctx: Contexto, ev: PointerEvent) {
  const { c, estado: e, acordar, gesto } = ctx;
  const [px, py] = ponto(c, ev);
  if (ctx.ponteiros.has(ev.pointerId)) ctx.ponteiros.set(ev.pointerId, { x: px, y: py });
  e.ponteiro = { x: px, y: py };
  if (gesto?.tipo === 'pinca') return moverPinca(ctx, gesto);
  if (gesto?.tipo === 'no') {
    const [gx, gy] = mundo(e, px, py);
    gesto.no.fx = gx;
    gesto.no.fy = gy;
    gesto.moveu = true;
    acordar.current();
    return;
  }
  if (gesto?.tipo === 'fundo') {
    arrastarFundo(e, gesto, px, py);
    acordar.current();
    return;
  }
  ctx.pendente = { x: px, y: py };
  if (!ctx.agendado) {
    ctx.agendado = true;
    requestAnimationFrame(() => processarPendente(ctx));
  }
  if (e.sobre) acordar.current(); // a dica acompanha o cursor
}

/** Soltar sem ter arrastado conta como clique: seleciona o nó (ou o que estiver sob o ponto, no fundo). */
function aoSoltar(ctx: Contexto, ev: PointerEvent) {
  const { c, estado: e, simulacao, acordar, aoSelecionar, gesto } = ctx;
  const [px, py] = ponto(c, ev);
  ctx.ponteiros.delete(ev.pointerId);
  if (gesto?.tipo === 'pinca') {
    if (ctx.ponteiros.size < 2) ctx.gesto = undefined;
    acordar.current();
    return;
  }
  if (gesto?.tipo === 'no') {
    const n = gesto.no;
    // Na arquitetura os blocos ficam onde foram soltos; na rede, a física leva o nó de volta para casa.
    if (e.modo !== 'arquitetura' && n.tipo !== 'nucleo') {
      n.fx = null;
      n.fy = null;
    } else if (e.modo !== 'arquitetura') {
      n.fx = n.hx;
      n.fy = n.hy;
    }
    e.arrastando = false;
    simulacao.current?.alphaTarget(0);
    if (!gesto.moveu) aoSelecionar(n);
  } else if (gesto?.tipo === 'fundo' && !gesto.moveu)
    aoSelecionar(noEm(e, px, py, ev.pointerType === 'touch' ? FOLGA_DO_TOQUE : FOLGA_DO_MOUSE));
  ctx.gesto = undefined;
  acordar.current();
}

function aoSairDoCanvas({ estado: e, acordar }: Contexto) {
  e.ponteiro = undefined;
  if (e.sobre) {
    e.sobre = undefined;
    acordar.current();
  }
}

/** Zoom em volta do cursor. */
function aoRolarRoda({ c, estado: e, acordar }: Contexto, ev: WheelEvent) {
  ev.preventDefault();
  const [px, py] = ponto(c, ev);
  const { k, x, y } = e.alvo;
  const novo = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, k * Math.exp(-ev.deltaY * 0.0018)));
  e.alvo = { k: novo, x: px - ((px - x) * novo) / k, y: py - ((py - y) * novo) / k };
  acordar.current();
}

function aoDarDuploClique({ c, estado: e, aoAbrir }: Contexto, ev: MouseEvent) {
  const [px, py] = ponto(c, ev);
  const n = noEm(e, px, py);
  if (n?.href) aoAbrir(n.href);
}

/** Vizinhos visíveis do nó selecionado, na ordem de relevância (a mesma da dica): é por onde o teclado caminha. */
const vizinhosParaTeclado = (e: EstadoDoGrafo, no: NoSim) =>
  ordenarVizinhos(
    [...(e.vizinhos.get(no.id) ?? [])].map((id) => e.porId.get(id)).filter((n): n is NoSim => Boolean(n)),
  ).slice(0, 30);

/** Teclado: setas caminham pelos vizinhos do nó selecionado, Home volta à SINDI, Enter abre, Esc limpa. */
function aoApertarTecla(ctx: Contexto, ev: KeyboardEvent) {
  const { estado: e, aoSelecionar, aoCentrar, aoAbrir } = ctx;
  const atual = e.selecionado;
  const escolher = (n: NoSim | undefined) => {
    if (!n) return;
    ev.preventDefault();
    aoSelecionar(n);
    aoCentrar(n);
  };
  if (ev.key === 'Escape') {
    if (atual) ev.preventDefault();
    return aoSelecionar(undefined);
  }
  if (ev.key === 'Home') return escolher(e.nos.find((n) => n.tipo === 'nucleo') ?? e.nos[0]);
  if (ev.key === 'Enter' && atual?.href) {
    ev.preventDefault();
    return aoAbrir(atual.href);
  }
  const passo = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
  if (!passo) return;
  if (!atual) return escolher(e.nos.find((n) => n.tipo === 'nucleo') ?? e.nos[0]);
  const lista = vizinhosParaTeclado(e, atual);
  if (!lista.length) return;
  ctx.teclado = (ctx.teclado + passo + lista.length) % lista.length;
  escolher(lista[ctx.teclado]);
}

/** Liga os eventos do ponteiro e do teclado ao canvas; devolve a função que os desliga. */
export function ligarInteracao(c: HTMLCanvasElement, ligacoes: Ligacoes) {
  const ctx: Contexto = { ...ligacoes, c, ponteiros: new Map(), agendado: false, teclado: -1 };
  const baixo = (ev: PointerEvent) => aoPressionar(ctx, ev);
  const mover = (ev: PointerEvent) => aoMoverPonteiro(ctx, ev);
  const cima = (ev: PointerEvent) => aoSoltar(ctx, ev);
  const sair = () => aoSairDoCanvas(ctx);
  const roda = (ev: WheelEvent) => aoRolarRoda(ctx, ev);
  const duploClique = (ev: MouseEvent) => aoDarDuploClique(ctx, ev);
  const tecla = (ev: KeyboardEvent) => aoApertarTecla(ctx, ev);

  c.addEventListener('pointerdown', baixo);
  c.addEventListener('pointermove', mover);
  c.addEventListener('pointerup', cima);
  c.addEventListener('pointercancel', cima);
  c.addEventListener('pointerleave', sair);
  c.addEventListener('wheel', roda, { passive: false });
  c.addEventListener('dblclick', duploClique);
  c.addEventListener('keydown', tecla);
  return () => {
    c.removeEventListener('pointerdown', baixo);
    c.removeEventListener('pointermove', mover);
    c.removeEventListener('pointerup', cima);
    c.removeEventListener('pointercancel', cima);
    c.removeEventListener('pointerleave', sair);
    c.removeEventListener('wheel', roda);
    c.removeEventListener('dblclick', duploClique);
    c.removeEventListener('keydown', tecla);
  };
}
