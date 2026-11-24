// Desenho do grafo em Canvas 2D próprio: compatível com a CSP (nada de `style=` no servidor, nenhum worker) e leve (ligações em lote, nós fora da
// tela ignorados, documentos recolhidos nas estantes). Estado e geometria vêm de layout-do-grafo.ts.
import { contornoOndulado, ELIPSES, todasAsRegioes, type Elipse } from '@/lib/grafo/cerebro-forma';
import { LEGENDA } from '@/lib/grafo/tipos';
import {
  dataDoGrafo,
  ehCentral,
  ordenarVizinhos,
  seguirAsEstantes,
  ZOOM_DOS_DOCUMENTOS,
  type Ajustes,
  type LigSim,
  type Modo,
  type NoSim,
  type Vista,
} from '@/componentes/cerebro/layout-do-grafo';
import { caberNaLargura, escolherRotulos, maisLigacoes, quebrarTexto, type Caixa } from '@/componentes/cerebro/texto-do-grafo';

const AMARELO = '#ebb92e';

/** Cores do canvas. O canvas não herda o CSS, então lemos o tema do <html> a cada quadro (e o hook redesenha ao trocar o tema). */
type Paleta = {
  fundoCentro: string;
  fundoBorda: string;
  fundoArquitetura: string;
  noNeutro: string;
  linha: string;
  sinapse: string;
  acento: string;
  texto: string;
  contornoDoTexto: string;
  silhueta: string;
  silhuetaPreenchimento: string;
  silhuetaBorda: string;
  seta: string;
  dicaFundo: string;
  dicaBorda: string;
  dicaSombra: string;
  dicaMeta: string;
  dicaVizinho: string;
  dicaMais: string;
  /** Contorno do nó achado pela busca e anel dos nós acesos: o branco some no tema claro. */
  achado: string;
  anel: string;
  pulso: string;
  haloDoNucleo: [string, string];
  haloDoFoco: string;
};

const CLARA: Paleta = {
  fundoCentro: '#faf8f5',
  fundoBorda: '#ffffff',
  fundoArquitetura: '#ffffff',
  noNeutro: '#8a8178',
  linha: 'rgba(45,39,39,0.18)',
  sinapse: 'rgba(235,185,46,0.75)',
  acento: AMARELO,
  texto: '#2d2727',
  contornoDoTexto: 'rgba(255,255,255,0.92)',
  silhueta: '#8a8178',
  silhuetaPreenchimento: 'rgba(138,129,120,0.04)',
  silhuetaBorda: 'rgba(138,129,120,0.9)',
  seta: 'rgba(45,39,39,0.35)',
  dicaFundo: 'rgba(255,255,255,0.98)',
  dicaBorda: 'rgba(235,185,46,0.8)',
  dicaSombra: 'rgba(45,39,39,0.18)',
  dicaMeta: '#6b625b',
  dicaVizinho: '#2d2727',
  dicaMais: '#6b625b',
  achado: '#2d2727',
  anel: AMARELO,
  pulso: AMARELO,
  haloDoNucleo: ['rgba(235,185,46,0.45)', 'rgba(235,185,46,0)'],
  haloDoFoco: 'rgba(235,185,46,0.28)',
};

const ESCURA: Paleta = {
  fundoCentro: '#1d1b1b',
  fundoBorda: '#121010',
  fundoArquitetura: '#171515',
  noNeutro: '#9e9e9e',
  linha: 'rgba(200,190,180,0.28)',
  sinapse: 'rgba(235,185,46,0.55)',
  acento: AMARELO,
  texto: '#ece8e4',
  contornoDoTexto: 'rgba(18,16,16,0.9)',
  silhueta: AMARELO,
  silhuetaPreenchimento: 'rgba(235,185,46,0.02)',
  silhuetaBorda: 'rgba(235,185,46,0.9)',
  seta: 'rgba(170,165,160,0.6)',
  dicaFundo: 'rgba(24,22,22,0.96)',
  dicaBorda: 'rgba(235,185,46,0.65)',
  dicaSombra: 'rgba(0,0,0,0.5)',
  dicaMeta: '#a8a29c',
  dicaVizinho: '#f3d98a',
  dicaMais: '#8f8982',
  achado: '#ffffff',
  anel: AMARELO,
  pulso: AMARELO,
  haloDoNucleo: ['rgba(235,185,46,0.55)', 'rgba(235,185,46,0)'],
  haloDoFoco: 'rgba(235,185,46,0.25)',
};

/** A paleta do tema atual; sem document (testes em Node) vale a clara, que é o padrão do site. */
const paleta = (): Paleta => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? ESCURA : CLARA);
// Lida uma vez por quadro em desenharQuadro; as funções de desenho abaixo só leem daqui, sem passar a paleta por todas as assinaturas.
let P: Paleta = CLARA;
const FONTE = 'ui-sans-serif, system-ui, sans-serif';
const MAX_ROTULOS = 36;
const VIZINHOS_NA_DICA = 6;

const REGIOES = new Map(todasAsRegioes().map((r) => [r.id, r]));
const corDaRegiao = (id?: string) => (id === 'sindi' ? AMARELO : (REGIOES.get(id ?? '')?.cor ?? '#94a3b8'));
const anatomiaDaRegiao = (id?: string) => REGIOES.get(id ?? '')?.anatomia;

/** A dica que acompanha o nó em foco: quem ele é e os vizinhos mais relevantes (nunca todos). */
export type DicaDoNo = { id: string; vizinhos: NoSim[]; mais: number };

/** Tudo o que o desenho e a interação leem e escrevem a cada quadro; vive numa ref para não provocar renderização do React. */
export type EstadoDoGrafo = {
  vista: Vista;
  alvo: Vista;
  sobre?: NoSim;
  esmaecer: number;
  nos: NoSim[];
  ligacoes: LigSim[];
  vizinhos: Map<string, Set<string>>;
  destaque: Set<string>;
  ajustes: Ajustes;
  selecionado?: NoSim;
  /** Quantos nós já "apareceram" na animação da linha do tempo (Infinity = todos). */
  revelados: number;
  grande: boolean;
  arrastando: boolean;
  quadro: number;
  modo: Modo;
  reduzir: boolean;
  /** Onde está o ponteiro (pixels CSS no canvas), para posicionar a dica. */
  ponteiro?: { x: number; y: number };
  /** Estantes cujos documentos estão abertos. */
  expandidas: Set<string>;
  /** Documentos presos a uma estante (acompanham a estante a cada quadro). */
  documentos: NoSim[];
  porId: Map<string, NoSim>;
  /** Nós "acesos" (ex.: os que a última resposta do chat usou). */
  ativos: Set<string>;
  dica?: DicaDoNo;
};

export const estadoInicialDoGrafo = (ajustes: Ajustes): EstadoDoGrafo => ({
  vista: { k: 1, x: 0, y: 0 },
  alvo: { k: 1, x: 0, y: 0 },
  sobre: undefined,
  esmaecer: 0,
  nos: [],
  ligacoes: [],
  vizinhos: new Map(),
  destaque: new Set(),
  ajustes,
  selecionado: undefined,
  revelados: Infinity,
  grande: false,
  arrastando: false,
  quadro: 0,
  modo: 'rede',
  reduzir: false,
  expandidas: new Set(),
  documentos: [],
  porId: new Map(),
  ativos: new Set(),
});

/** O que muda de um quadro para o outro: a vista já interpolada, o nó em foco e seus vizinhos, o tamanho da tela e o relógio da animação. */
type Quadro = {
  e: EstadoDoGrafo;
  k: number;
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
  tempo: number;
  foco?: NoSim;
  perto?: Set<string>;
};

const posicao = (n: NoSim) => [n.x ?? 0, n.y ?? 0] as const;
const naTela = (q: Quadro, n: NoSim) => {
  const sx = (n.x ?? 0) * q.k + q.x;
  const sy = (n.y ?? 0) * q.k + q.y;
  return sx > -60 && sx < q.w + 60 && sy > -60 && sy < q.h + 60;
};
const revelado = (q: Quadro, n: NoSim) => n.ordem < q.e.revelados;
const emFoco = (q: Quadro, n: NoSim) => !q.foco || n.id === q.foco.id || Boolean(q.perto?.has(n.id));
const ehOFoco = (q: Quadro, n: NoSim) => Boolean(q.foco) && n.id === q.foco!.id;
const corDoNo = (e: EstadoDoGrafo, n: NoSim) => (e.ajustes.cores ? LEGENDA[n.tipo].cor : P.noNeutro);

/** O nó aparece? Os documentos ficam recolhidos na estante: só se mostram com zoom, na estante aberta ou quando a resposta do chat os usou. */
export const noVisivel = (e: EstadoDoGrafo, n: NoSim) =>
  n.tipo !== 'documento' ||
  !n.paiRef ||
  e.vista.k >= ZOOM_DOS_DOCUMENTOS ||
  e.expandidas.has(n.paiRef.id) ||
  e.ativos.has(n.id) ||
  e.selecionado?.id === n.id;

/** Dimensiona o canvas para a tela (com a densidade de pixels) e devolve o tamanho em pixels CSS. */
function ajustarTamanho(c: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  return { dpr, w, h };
}

/** Zoom e deslocamento suaves (interpolação até o alvo), esmaecimento ao focar e a revelação da animação em linha do tempo. */
function avancarAnimacao(e: EstadoDoGrafo) {
  const suave = e.reduzir ? 1 : 0.22;
  const v = e.vista;
  const a = e.alvo;
  v.k += (a.k - v.k) * suave;
  v.x += (a.x - v.x) * suave;
  v.y += (a.y - v.y) * suave;
  const foco = e.sobre ?? e.selecionado;
  e.esmaecer += ((foco ? 1 : 0) - e.esmaecer) * (e.reduzir ? 1 : 0.18);
  if (e.revelados < e.nos.length) e.revelados += Math.max(1, e.nos.length / 260);
  return foco;
}

/** Os vizinhos mais relevantes do nó em foco, calculados uma vez por nó (não a cada quadro). */
function atualizarDica(e: EstadoDoGrafo, foco: NoSim | undefined) {
  if (!foco) {
    e.dica = undefined;
    return;
  }
  if (e.dica?.id === foco.id) return;
  const todos = [...(e.vizinhos.get(foco.id) ?? [])].map((id) => e.porId.get(id)).filter((n): n is NoSim => Boolean(n));
  e.dica = {
    id: foco.id,
    vizinhos: ordenarVizinhos(todos).slice(0, VIZINHOS_NA_DICA),
    mais: Math.max(0, todos.length - VIZINHOS_NA_DICA),
  };
}

// ------------------------------------------------------------------------------------------------ silhueta do cérebro
type Hemisferio = { elipse: Elipse; contorno: Path2D };
let hemisferios: Hemisferio[] | undefined;

/** Contorno de cada hemisfério, montado uma vez. */
function formasDoCerebro() {
  if (hemisferios) return hemisferios;
  hemisferios = ELIPSES.map((elipse) => {
    const contorno = new Path2D();
    const pontos = contornoOndulado(elipse);
    contorno.moveTo(...pontos[0]);
    for (const p of pontos.slice(1)) contorno.lineTo(...p);
    contorno.closePath();
    return { elipse, contorno };
  });
  return hemisferios;
}

/**
 * O fundo da rede: só a silhueta do cérebro visto de cima (dois hemisférios separados pela fissura), como um contorno bem discreto (só o formato), e o
 * brilho discreto de cada região. Sem textura nem cores de preenchimento: quem aparece são os nós. Na arquitetura não há cérebro.
 */
function desenharCerebro(ctx: CanvasRenderingContext2D, q: Quadro) {
  if (q.e.modo !== 'rede' || typeof Path2D === 'undefined') return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const { contorno } of formasDoCerebro()) {
    ctx.strokeStyle = P.silhueta;
    for (const [largura, alfa] of [
      [40, 0.012],
      [18, 0.02],
      [7, 0.035],
    ] as const) {
      ctx.globalAlpha = alfa;
      ctx.lineWidth = largura;
      ctx.stroke(contorno);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.silhuetaPreenchimento;
    ctx.fill(contorno);
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = P.silhuetaBorda;
    ctx.lineWidth = 1.6;
    ctx.stroke(contorno);
  }
  // Fissura longitudinal entre os hemisférios: um traço fino.
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = P.silhuetaBorda;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -470);
  ctx.lineTo(0, 510);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const r of REGIOES.values()) {
    const brilho = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, 170);
    brilho.addColorStop(0, `${r.cor}16`);
    brilho.addColorStop(1, `${r.cor}00`);
    ctx.fillStyle = brilho;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 170, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------------------------------------------ ligações
/** Ponto de controle da sinapse curva: no meio, deslocado para o lado (sempre o mesmo lado para o mesmo par). */
function controle(s: NoSim, t: NoSim) {
  const mx = ((s.x ?? 0) + (t.x ?? 0)) / 2;
  const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
  const dx = (t.x ?? 0) - (s.x ?? 0);
  const dy = (t.y ?? 0) - (s.y ?? 0);
  const lado = (s.ordem + t.ordem) % 2 ? 1 : -1;
  return [mx - dy * 0.14 * lado, my + dx * 0.14 * lado] as const;
}
const comDocumento = (s: NoSim, t: NoSim) => s.tipo === 'documento' || t.tipo === 'documento';
/** Traça a ligação: curva entre nós da rede, reta quando toca um documento. */
function tracar(ctx: CanvasRenderingContext2D, s: NoSim, t: NoSim, modo: Modo) {
  ctx.moveTo(...posicao(s));
  if (modo === 'arquitetura' || comDocumento(s, t)) ctx.lineTo(...posicao(t));
  else ctx.quadraticCurveTo(...controle(s, t), ...posicao(t));
}

/** Ligações em lotes: as comuns, as sinapses fortes (área → estante) e as do nó em foco (cor de destaque). Devolve as do foco, para as setas. */
function desenharLigacoes(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e, foco } = q;
  const largura = (e.ajustes.espessura * 0.9) / Math.max(q.k, 0.4);
  const comuns: LigSim[] = [];
  const fortes: LigSim[] = [];
  const doFoco: LigSim[] = [];
  for (const l of e.ligacoes) {
    const s = l.source as NoSim;
    const t = l.target as NoSim;
    if (!revelado(q, s) || !revelado(q, t) || !noVisivel(e, s) || !noVisivel(e, t)) continue;
    if (l.tipo === 'guarda' && comDocumento(s, t) && !(foco && (s.id === foco.id || t.id === foco.id))) continue; // a nuvem já mostra a quem pertence
    if (foco && (s.id === foco.id || t.id === foco.id)) doFoco.push(l);
    else if (l.tipo === 'especialista' || l.tipo === 'consulta') fortes.push(l);
    else comuns.push(l);
  }
  const lote = (lista: LigSim[], cor: string, espessura: number, alfa: number) => {
    if (!lista.length) return;
    ctx.strokeStyle = cor;
    ctx.lineWidth = espessura;
    ctx.globalAlpha = alfa;
    ctx.beginPath();
    for (const l of lista) tracar(ctx, l.source as NoSim, l.target as NoSim, e.modo);
    ctx.stroke();
  };
  const apagado = 1 - 0.75 * e.esmaecer;
  lote(comuns, P.linha, largura, apagado);
  lote(fortes, P.sinapse, largura * 1.7, apagado);
  ctx.globalAlpha = 1;
  lote(doFoco, P.acento, largura * 1.9, 1);
  return doFoco;
}

/** Pulsos de atividade: um ponto de luz que viaja da SINDI às áreas e das áreas às estantes; os caminhos "acesos" pelo chat pulsam mais forte. */
function desenharPulsos(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e } = q;
  if (!e.ajustes.pulsos || e.reduzir || e.modo !== 'rede') return;
  let i = 0;
  for (const l of e.ligacoes) {
    if (l.tipo !== 'especialista' && l.tipo !== 'consulta') continue;
    const s = l.source as NoSim;
    const t = l.target as NoSim;
    i++;
    const aceso = e.ativos.has(s.id) && e.ativos.has(t.id);
    if (!revelado(q, s) || !revelado(q, t) || (!aceso && e.esmaecer > 0.5)) continue;
    const p = ((q.tempo / (aceso ? 1400 : 3600) + i * 0.137) % 1 + 1) % 1;
    const [cx, cy] = controle(s, t);
    const a = 1 - p;
    const px = a * a * (s.x ?? 0) + 2 * a * p * cx + p * p * (t.x ?? 0);
    const py = a * a * (s.y ?? 0) + 2 * a * p * cy + p * p * (t.y ?? 0);
    const raio = (aceso ? 4.2 : 2.6) / Math.max(q.k, 0.5);
    ctx.fillStyle = aceso ? P.pulso : corDaRegiao(t.regiao);
    ctx.globalAlpha = aceso ? 0.9 : 0.75 * Math.sin(p * Math.PI);
    ctx.beginPath();
    ctx.arc(px, py, raio, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (aceso ? 0.3 : 0.16) * Math.sin(p * Math.PI);
    ctx.beginPath();
    ctx.arc(px, py, raio * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Setas (no fim de cada ligação), como a opção "Arrows" do Obsidian. */
function desenharSetas(ctx: CanvasRenderingContext2D, q: Quadro, doFoco: LigSim[]) {
  const { e, foco } = q;
  ctx.fillStyle = foco ? P.acento : P.seta;
  for (const l of foco ? doFoco : e.ligacoes.length < 4000 ? e.ligacoes : []) {
    const s = l.source as NoSim;
    const t = l.target as NoSim;
    if (!revelado(q, s) || !revelado(q, t) || !noVisivel(e, s) || !noVisivel(e, t)) continue;
    const ang = Math.atan2((t.y ?? 0) - (s.y ?? 0), (t.x ?? 0) - (s.x ?? 0));
    const recuo = t.r * e.ajustes.tamanho + 1.5;
    const tam = 4 / Math.max(q.k, 0.5);
    const px = (t.x ?? 0) - Math.cos(ang) * recuo;
    const py = (t.y ?? 0) - Math.sin(ang) * recuo;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang - 0.45) * tam, py - Math.sin(ang - 0.45) * tam);
    ctx.lineTo(px - Math.cos(ang + 0.45) * tam, py - Math.sin(ang + 0.45) * tam);
    ctx.fill();
  }
}

// ------------------------------------------------------------------------------------------------ nós
type LoteDeNos = { cor: string; alfa: number; nos: { x: number; y: number; r: number }[] };

/** Brilho do nó: a estante agrupa documentos (halo do tamanho da nuvem); a SINDI respira; os nós acesos pelo chat ganham um anel. */
function desenharBrilhos(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e } = q;
  for (const n of e.nos) {
    if (!revelado(q, n) || !naTela(q, n)) continue;
    const [x, y] = posicao(n);
    const r = n.r * e.ajustes.tamanho;
    if (n.tipo === 'nucleo') {
      const respiro = e.ajustes.pulsos && !e.reduzir ? 1 + 0.06 * Math.sin(q.tempo / 700) : 1;
      const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 3.4 * respiro);
      halo.addColorStop(0, P.haloDoNucleo[0]);
      halo.addColorStop(1, P.haloDoNucleo[1]);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.4 * respiro, 0, Math.PI * 2);
      ctx.fill();
    } else if (n.tipo === 'estante' && n.filhos && !e.expandidas.has(n.id)) {
      ctx.globalAlpha = 0.16 * (1 - 0.8 * e.esmaecer * (emFoco(q, n) ? 0 : 1));
      ctx.fillStyle = corDaRegiao(n.regiao);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.ativos.has(n.id)) {
      ctx.strokeStyle = P.anel;
      ctx.lineWidth = 2 / q.k;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6 + 2 / q.k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/** Nós em lote: um traçado por cor e por estado (ativo/esmaecido), em vez de um preenchimento por nó. */
function desenharNos(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e } = q;
  const lotes = new Map<string, LoteDeNos>();
  const especiais: NoSim[] = [];
  const alfaApagado = 1 - 0.85 * e.esmaecer;
  for (const n of e.nos) {
    if (!revelado(q, n) || !noVisivel(e, n) || !naTela(q, n)) continue;
    if (ehOFoco(q, n) || e.destaque.has(n.id)) {
      especiais.push(n);
      continue;
    }
    const cor = corDoNo(e, n);
    const alfa = emFoco(q, n) ? 1 : alfaApagado;
    const chave = `${cor}|${alfa}`;
    (lotes.get(chave) ?? lotes.set(chave, { cor, alfa, nos: [] }).get(chave)!).nos.push({
      x: n.x ?? 0,
      y: n.y ?? 0,
      r: n.r * e.ajustes.tamanho,
    });
  }
  for (const lote of lotes.values()) {
    ctx.globalAlpha = lote.alfa;
    ctx.fillStyle = lote.cor;
    ctx.beginPath();
    for (const p of lote.nos) {
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const n of especiais) desenharNoEspecial(ctx, q, n);
}

/** Nó em foco (com halo) ou achado pela busca (maior e com contorno branco). */
function desenharNoEspecial(ctx: CanvasRenderingContext2D, q: Quadro, n: NoSim) {
  const { e } = q;
  const noFoco = ehOFoco(q, n);
  const achado = e.destaque.has(n.id);
  const r = n.r * e.ajustes.tamanho * (achado ? 1.6 : 1) * (noFoco ? 1.25 : 1);
  const [x, y] = posicao(n);
  if (noFoco) {
    ctx.fillStyle = P.haloDoFoco;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = noFoco ? P.acento : corDoNo(e, n);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (achado) {
    ctx.strokeStyle = P.achado;
    ctx.lineWidth = 1.5 / q.k;
    ctx.stroke();
  }
}

// ------------------------------------------------------------------------------------------------ rótulos e dica (em pixels da tela)
type Candidato = Caixa & { texto: string; central: boolean; alfa: number };

/** Prioridade do rótulo: o nó em foco primeiro, depois seleção, busca, vizinhos relevantes, nós acesos, a SINDI, áreas, estantes e o resto por ligações. */
function prioridadeDoRotulo(q: Quadro, n: NoSim, vizinhosDaDica: Set<string>) {
  if (ehOFoco(q, n)) return 1e9;
  if (q.e.selecionado?.id === n.id) return 9e8;
  if (q.e.destaque.has(n.id)) return 8e8;
  if (vizinhosDaDica.has(n.id)) return 7e8;
  if (q.e.ativos.has(n.id)) return 6e8;
  if (n.tipo === 'nucleo') return 5e8;
  if (n.tipo === 'conector') return 4e8;
  if (n.tipo === 'estante') return 3e8 + n.filhos;
  return n.grau + (n.tipo === 'documento' ? 0 : 1000);
}

/** Rótulos que cabem sem se sobrepor (colisão em pixels da tela), com contorno escuro para ler sobre as ligações. */
function desenharRotulos(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e, k, foco } = q;
  const limiar = 1.1 * Math.pow(2, e.ajustes.limiarTexto);
  const vizinhosDaDica = new Set(e.dica?.vizinhos.map((n) => n.id) ?? []);
  const fonteCentral = `600 13px ${FONTE}`;
  const fonteComum = `11px ${FONTE}`;
  const candidatos: Candidato[] = [];
  for (const n of e.nos) {
    if (!revelado(q, n) || !noVisivel(e, n) || !naTela(q, n)) continue;
    const forcado =
      ehOFoco(q, n) ||
      vizinhosDaDica.has(n.id) ||
      e.destaque.has(n.id) ||
      e.ativos.has(n.id) ||
      e.selecionado?.id === n.id ||
      e.modo === 'arquitetura';
    const base = ehCentral(n) && !(n.tipo === 'estante' && n.filhos < 30) ? limiar * 0.22 : n.tipo === 'documento' ? limiar * 1.6 : limiar * 0.75;
    // Teste barato primeiro: sem zoom suficiente e sem ser forçado, o rótulo nem é considerado.
    if (!forcado && k <= base) continue;
    let alfa = forcado ? 1 : Math.min(1, Math.max(0, (k - base) / (base * 0.6)));
    if (foco && !emFoco(q, n)) alfa *= 1 - 0.9 * e.esmaecer;
    if (alfa < 0.05) continue;
    // Estante pequena (poucos documentos) só ganha rótulo com zoom, como um nó comum: no zoom de longe ficam as áreas e as estantes grandes.
    const central = ehCentral(n) && !(n.tipo === 'estante' && n.filhos < 30);
    ctx.font = central ? fonteCentral : fonteComum;
    const base_ = n.tipo === 'estante' && n.filhos ? `${n.rotulo} · ${n.filhos.toLocaleString('pt-BR')}` : n.rotulo;
    const texto = caberNaLargura(base_, 230, (t) => ctx.measureText(t).width);
    const largura = ctx.measureText(texto).width;
    const sx = (n.x ?? 0) * k + q.x;
    const sy = (n.y ?? 0) * k + q.y + n.r * e.ajustes.tamanho * k + 4;
    candidatos.push({
      id: n.id,
      x: sx - largura / 2,
      y: sy,
      largura,
      altura: central ? 16 : 14,
      prioridade: prioridadeDoRotulo(q, n, vizinhosDaDica),
      texto,
      central,
      alfa,
    });
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = P.contornoDoTexto;
  ctx.fillStyle = P.texto;
  for (const c of escolherRotulos(candidatos, MAX_ROTULOS) as Candidato[]) {
    ctx.font = c.central ? fonteCentral : fonteComum;
    ctx.globalAlpha = c.alfa;
    ctx.strokeText(c.texto, c.x + c.largura / 2, c.y);
    ctx.fillText(c.texto, c.x + c.largura / 2, c.y);
  }
  ctx.globalAlpha = 1;
}

/** Linhas da dica: título (quebrado por largura), tipo/data/ligações, região e os vizinhos mais relevantes. */
function linhasDaDica(ctx: CanvasRenderingContext2D, n: NoSim, dica: DicaDoNo | undefined, largura: number) {
  const medir = (t: string) => ctx.measureText(t).width;
  ctx.font = `600 13px ${FONTE}`;
  const titulo = quebrarTexto(n.rotulo, largura, medir, 3);
  ctx.font = `11px ${FONTE}`;
  const meta = [LEGENDA[n.tipo].nome, n.data ? dataDoGrafo(n.data) : '', `${n.grau.toLocaleString('pt-BR')} ligações`]
    .filter(Boolean)
    .join(' · ');
  const detalhes = [
    ...quebrarTexto(meta, largura, medir, 2),
    ...(n.filhos ? [`${n.filhos.toLocaleString('pt-BR')} documentos agrupados`] : []),
    ...(n.tipo === 'nucleo' ? ['Orquestra as áreas do cérebro'] : []),
    ...(anatomiaDaRegiao(n.regiao) && n.tipo !== 'nucleo' ? [`Região: ${anatomiaDaRegiao(n.regiao)}`] : []),
  ];
  const vizinhos = (dica?.id === n.id ? dica.vizinhos : []).map((v) => `↳ ${caberNaLargura(v.rotulo, largura - 14, medir)}`);
  const mais = dica?.id === n.id && dica.mais > 0 ? [maisLigacoes(dica.mais)] : [];
  return { titulo, detalhes, vizinhos, mais };
}

/** A dica do nó em foco: caixa com fundo, que nunca passa da largura nem sai da tela. */
function desenharDica(ctx: CanvasRenderingContext2D, q: Quadro) {
  const { e, foco, w, h } = q;
  if (!foco || !naTela(q, foco)) return;
  const largura = Math.min(280, w - 36);
  const { titulo, detalhes, vizinhos, mais } = linhasDaDica(ctx, foco, e.dica, largura);
  const altura = 20 + titulo.length * 17 + detalhes.length * 15 + (vizinhos.length + mais.length) * 15 + (vizinhos.length || mais.length ? 6 : 0);
  const ancora = e.sobre && e.ponteiro ? e.ponteiro : { x: (foco.x ?? 0) * q.k + q.x, y: (foco.y ?? 0) * q.k + q.y };
  let x = ancora.x + 16;
  let y = ancora.y + 16;
  if (x + largura + 20 > w - 8) x = ancora.x - 16 - (largura + 20);
  if (y + altura > h - 8) y = ancora.y - 16 - altura;
  x = Math.max(8, Math.min(x, w - largura - 28));
  y = Math.max(8, Math.min(y, h - altura - 8));
  // Sombra só na caixa (o texto vem depois, sem ela), no mesmo espírito dos cartões do site.
  ctx.save();
  ctx.shadowColor = P.dicaSombra;
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = P.dicaFundo;
  ctx.beginPath();
  ctx.roundRect(x, y, largura + 20, altura, 16);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = P.dicaBorda;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let cursor = y + 10;
  ctx.fillStyle = P.texto;
  ctx.font = `600 13px ${FONTE}`;
  for (const linha of titulo) {
    ctx.fillText(linha, x + 10, cursor);
    cursor += 17;
  }
  ctx.font = `11px ${FONTE}`;
  ctx.fillStyle = P.dicaMeta;
  for (const linha of detalhes) {
    ctx.fillText(linha, x + 10, cursor);
    cursor += 15;
  }
  if (vizinhos.length || mais.length) cursor += 6;
  ctx.fillStyle = P.dicaVizinho;
  for (const linha of vizinhos) {
    ctx.fillText(linha, x + 10, cursor);
    cursor += 15;
  }
  ctx.fillStyle = P.dicaMais;
  for (const linha of mais) {
    ctx.fillText(linha, x + 10, cursor);
    cursor += 15;
  }
}

/** Há mais quadros a desenhar? (zoom ainda se movendo, esmaecimento, animação da linha do tempo, arraste ou pulsos de atividade). */
function precisaDeOutroQuadro(e: EstadoDoGrafo, foco: NoSim | undefined) {
  const { vista: v, alvo: a } = e;
  const movendo = Math.abs(a.k - v.k) > 1e-3 * a.k || Math.abs(a.x - v.x) > 0.3 || Math.abs(a.y - v.y) > 0.3;
  const esmaecendo = Math.abs((foco ? 1 : 0) - e.esmaecer) > 0.01;
  const vivo = e.ajustes.pulsos && !e.reduzir && e.modo === 'rede';
  return movendo || esmaecendo || e.revelados < e.nos.length || e.arrastando || vivo;
}

/** Desenha um quadro e diz se é preciso pedir outro. */
export function desenharQuadro(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, e: EstadoDoGrafo) {
  const { dpr, w, h } = ajustarTamanho(c);
  P = paleta();
  const foco = avancarAnimacao(e);
  seguirAsEstantes(e.documentos);
  atualizarDica(e, foco);
  const { k, x, y } = e.vista;
  const q: Quadro = {
    e,
    k,
    x,
    y,
    w,
    h,
    dpr,
    tempo: performance.now(),
    foco,
    perto: foco ? e.vizinhos.get(foco.id) : undefined,
  };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (e.modo === 'rede') {
    // Radial sutil: o centro destaca a silhueta sem virar fundo chapado (o tema claro precisa de vários tons para o teste de pixels).
    const fundo = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    fundo.addColorStop(0, P.fundoCentro);
    fundo.addColorStop(1, P.fundoBorda);
    ctx.fillStyle = fundo;
  } else ctx.fillStyle = P.fundoArquitetura;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
  desenharCerebro(ctx, q);
  const doFoco = desenharLigacoes(ctx, q);
  if (e.ajustes.setas) desenharSetas(ctx, q, doFoco);
  desenharPulsos(ctx, q);
  desenharBrilhos(ctx, q);
  desenharNos(ctx, q);
  // Rótulos e dica em pixels da tela: o texto não encolhe nem cresce com o zoom e a colisão é medida em pixels.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  desenharRotulos(ctx, q);
  desenharDica(ctx, q);
  return precisaDeOutroQuadro(e, foco);
}
