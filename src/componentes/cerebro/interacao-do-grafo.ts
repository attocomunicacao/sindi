// Interação do grafo com o ponteiro: arrastar nó (a física puxa os vizinhos), arrastar o fundo (move a vista), roda (zoom em volta do cursor), clique e duplo clique.
import type { RefObject } from 'react';
import type { EstadoDoGrafo } from '@/componentes/cerebro/desenho-do-grafo';
import type { NoSim, SimulacaoDoGrafo } from '@/componentes/cerebro/layout-do-grafo';

const ZOOM_MINIMO = 0.03;
const ZOOM_MAXIMO = 12;
/** Deslocamento (px) a partir do qual um arraste do fundo deixa de contar como clique. */
const TOLERANCIA_DO_CLIQUE = 3;

type Gesto =
  | { tipo: 'no'; no: NoSim; moveu: boolean }
  | { tipo: 'fundo'; x: number; y: number; vx: number; vy: number; moveu: boolean };

type Ligacoes = {
  estado: EstadoDoGrafo;
  simulacao: RefObject<SimulacaoDoGrafo | undefined>;
  /** Pede o próximo quadro de desenho. */
  acordar: RefObject<() => void>;
  aoSelecionar: (no: NoSim | undefined) => void;
  aoAbrir: (endereco: string) => void;
};

/** O que os handlers compartilham: o canvas, as ligações com o resto do hook e o gesto em andamento. */
type Contexto = Ligacoes & { c: HTMLCanvasElement; gesto?: Gesto };

const mundo = (e: EstadoDoGrafo, px: number, py: number) =>
  [(px - e.vista.x) / e.vista.k, (py - e.vista.y) / e.vista.k] as const;

/** Posição do ponteiro em relação ao canvas. */
function ponto(c: HTMLCanvasElement, ev: PointerEvent | WheelEvent | MouseEvent) {
  const r = c.getBoundingClientRect();
  return [ev.clientX - r.left, ev.clientY - r.top] as const;
}

/** O nó mais próximo do ponto (já revelado e dentro do alcance), se houver. */
function noEm(e: EstadoDoGrafo, px: number, py: number) {
  const [gx, gy] = mundo(e, px, py);
  let melhor: NoSim | undefined;
  let distancia = Infinity;
  for (const n of e.nos) {
    if (n.ordem >= e.revelados) continue;
    const d = ((n.x ?? 0) - gx) ** 2 + ((n.y ?? 0) - gy) ** 2;
    const alcance = (n.r * e.ajustes.tamanho + 5 / e.vista.k) ** 2;
    if (d < alcance && d < distancia) {
      melhor = n;
      distancia = d;
    }
  }
  return melhor;
}

/** Pressionar sobre um nó o fixa para arrastar; fora de nó, começa o arraste do fundo. */
function aoPressionar(ctx: Contexto, ev: PointerEvent) {
  const { c, estado: e, simulacao } = ctx;
  const [px, py] = ponto(c, ev);
  const n = noEm(e, px, py);
  c.setPointerCapture(ev.pointerId);
  if (n) {
    ctx.gesto = { tipo: 'no', no: n, moveu: false };
    n.fx = n.x;
    n.fy = n.y;
    e.arrastando = true;
    simulacao.current?.alphaTarget(e.grande ? 0.08 : 0.25).restart();
  } else ctx.gesto = { tipo: 'fundo', x: px, y: py, vx: e.alvo.x, vy: e.alvo.y, moveu: false };
}

function arrastarFundo(e: EstadoDoGrafo, g: Extract<Gesto, { tipo: 'fundo' }>, px: number, py: number) {
  const dx = px - g.x;
  const dy = py - g.y;
  if (Math.abs(dx) + Math.abs(dy) > TOLERANCIA_DO_CLIQUE) g.moveu = true;
  e.alvo = { ...e.alvo, x: g.vx + dx, y: g.vy + dy };
  e.vista = { ...e.vista, x: e.alvo.x, y: e.alvo.y };
}

/** Arrasta o nó ou o fundo; sem gesto, só acompanha qual nó está sob o cursor. */
function aoMoverPonteiro(ctx: Contexto, ev: PointerEvent) {
  const { c, estado: e, acordar, gesto } = ctx;
  const [px, py] = ponto(c, ev);
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
  const n = noEm(e, px, py);
  if (n !== e.sobre) {
    e.sobre = n;
    c.classList.toggle('cursor-pointer', Boolean(n));
    acordar.current();
  }
}

/** Soltar sem ter arrastado conta como clique: seleciona o nó (ou o que estiver sob o ponto, no fundo). */
function aoSoltar(ctx: Contexto, ev: PointerEvent) {
  const { c, estado: e, simulacao, acordar, aoSelecionar, gesto } = ctx;
  const [px, py] = ponto(c, ev);
  if (gesto?.tipo === 'no') {
    const n = gesto.no;
    // Na arquitetura os blocos ficam onde foram soltos; na rede, a física volta a movê-los.
    if (e.modo !== 'arquitetura') {
      n.fx = null;
      n.fy = null;
    }
    e.arrastando = false;
    simulacao.current?.alphaTarget(0);
    if (!gesto.moveu) aoSelecionar(n);
  } else if (gesto?.tipo === 'fundo' && !gesto.moveu) aoSelecionar(noEm(e, px, py));
  ctx.gesto = undefined;
  acordar.current();
}

function aoSairDoCanvas({ estado: e, acordar }: Contexto) {
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

/** Liga os eventos do ponteiro ao canvas; devolve a função que os desliga. */
export function ligarInteracao(c: HTMLCanvasElement, ligacoes: Ligacoes) {
  const ctx: Contexto = { ...ligacoes, c };
  const baixo = (ev: PointerEvent) => aoPressionar(ctx, ev);
  const mover = (ev: PointerEvent) => aoMoverPonteiro(ctx, ev);
  const cima = (ev: PointerEvent) => aoSoltar(ctx, ev);
  const sair = () => aoSairDoCanvas(ctx);
  const roda = (ev: WheelEvent) => aoRolarRoda(ctx, ev);
  const duploClique = (ev: MouseEvent) => aoDarDuploClique(ctx, ev);

  c.addEventListener('pointerdown', baixo);
  c.addEventListener('pointermove', mover);
  c.addEventListener('pointerup', cima);
  c.addEventListener('pointerleave', sair);
  c.addEventListener('wheel', roda, { passive: false });
  c.addEventListener('dblclick', duploClique);
  return () => {
    c.removeEventListener('pointerdown', baixo);
    c.removeEventListener('pointermove', mover);
    c.removeEventListener('pointerup', cima);
    c.removeEventListener('pointerleave', sair);
    c.removeEventListener('wheel', roda);
    c.removeEventListener('dblclick', duploClique);
  };
}
