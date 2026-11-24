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

/** Liga os eventos do ponteiro ao canvas; devolve a função que os desliga. */
export function ligarInteracao(c: HTMLCanvasElement, { estado: e, simulacao, acordar, aoSelecionar, aoAbrir }: Ligacoes) {
  const mundo = (px: number, py: number) => [(px - e.vista.x) / e.vista.k, (py - e.vista.y) / e.vista.k] as const;
  const noEm = (px: number, py: number) => {
    const [gx, gy] = mundo(px, py);
    let melhor: NoSim | undefined; let distancia = Infinity;
    for (const n of e.nos) {
      if (n.ordem >= e.revelados) continue;
      const d = ((n.x ?? 0) - gx) ** 2 + ((n.y ?? 0) - gy) ** 2;
      const alcance = (n.r * e.ajustes.tamanho + 5 / e.vista.k) ** 2;
      if (d < alcance && d < distancia) { melhor = n; distancia = d; }
    }
    return melhor;
  };
  const ponto = (ev: PointerEvent | WheelEvent | MouseEvent) => { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top] as const; };
  let gesto: Gesto | undefined;

  const baixo = (ev: PointerEvent) => {
    const [px, py] = ponto(ev);
    const n = noEm(px, py);
    c.setPointerCapture(ev.pointerId);
    if (n) {
      gesto = { tipo: 'no', no: n, moveu: false };
      n.fx = n.x; n.fy = n.y; e.arrastando = true;
      simulacao.current?.alphaTarget(e.grande ? 0.08 : 0.25).restart();
    } else gesto = { tipo: 'fundo', x: px, y: py, vx: e.alvo.x, vy: e.alvo.y, moveu: false };
  };

  const arrastarFundo = (g: Extract<Gesto, { tipo: 'fundo' }>, px: number, py: number) => {
    const dx = px - g.x; const dy = py - g.y;
    if (Math.abs(dx) + Math.abs(dy) > TOLERANCIA_DO_CLIQUE) g.moveu = true;
    e.alvo = { ...e.alvo, x: g.vx + dx, y: g.vy + dy };
    e.vista = { ...e.vista, x: e.alvo.x, y: e.alvo.y };
  };

  const mover = (ev: PointerEvent) => {
    const [px, py] = ponto(ev);
    if (gesto?.tipo === 'no') {
      const [gx, gy] = mundo(px, py);
      gesto.no.fx = gx; gesto.no.fy = gy; gesto.moveu = true;
      acordar.current(); return;
    }
    if (gesto?.tipo === 'fundo') { arrastarFundo(gesto, px, py); acordar.current(); return; }
    const n = noEm(px, py);
    if (n !== e.sobre) { e.sobre = n; c.classList.toggle('cursor-pointer', Boolean(n)); acordar.current(); }
  };

  const cima = (ev: PointerEvent) => {
    const [px, py] = ponto(ev);
    if (gesto?.tipo === 'no') {
      const n = gesto.no;
      // Na arquitetura os blocos ficam onde foram soltos; na rede, a física volta a movê-los.
      if (e.modo !== 'arquitetura') { n.fx = null; n.fy = null; }
      e.arrastando = false; simulacao.current?.alphaTarget(0);
      if (!gesto.moveu) aoSelecionar(n);
    } else if (gesto?.tipo === 'fundo' && !gesto.moveu) aoSelecionar(noEm(px, py));
    gesto = undefined; acordar.current();
  };

  const sair = () => { if (e.sobre) { e.sobre = undefined; acordar.current(); } };

  const roda = (ev: WheelEvent) => {
    ev.preventDefault();
    const [px, py] = ponto(ev);
    const { k, x, y } = e.alvo;
    const novo = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, k * Math.exp(-ev.deltaY * 0.0018)));
    e.alvo = { k: novo, x: px - ((px - x) * novo) / k, y: py - ((py - y) * novo) / k };
    acordar.current();
  };

  const duploClique = (ev: MouseEvent) => {
    const [px, py] = ponto(ev);
    const n = noEm(px, py);
    if (n?.href) aoAbrir(n.href);
  };

  c.addEventListener('pointerdown', baixo); c.addEventListener('pointermove', mover); c.addEventListener('pointerup', cima); c.addEventListener('pointerleave', sair);
  c.addEventListener('wheel', roda, { passive: false }); c.addEventListener('dblclick', duploClique);
  return () => {
    c.removeEventListener('pointerdown', baixo); c.removeEventListener('pointermove', mover); c.removeEventListener('pointerup', cima); c.removeEventListener('pointerleave', sair);
    c.removeEventListener('wheel', roda); c.removeEventListener('dblclick', duploClique);
  };
}
