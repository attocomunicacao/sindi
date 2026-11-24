// Lógica do grafo sem DOM: tipos, conjuntos visíveis, busca e a simulação de forças (d3-force). O desenho fica em desenho-do-grafo.ts.
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { dataBR } from '@/lib/base/formato';
import { ELIPSES } from '@/lib/grafo/cerebro-forma';
import { LEGENDA, type Aresta, type No, type TipoDeAresta, type TipoDeNo } from '@/lib/grafo/tipos';

export type Modo = 'rede' | 'arquitetura';
/** Nó da simulação: os dados do nó, o raio, a ordem da linha do tempo, a posição "de casa" calculada no servidor e, nos documentos, o pai. */
export type NoSim = SimulationNodeDatum &
  No & {
    r: number;
    ordem: number;
    /** Posição de casa (a do servidor): a força de centro puxa o nó para lá, e é isso que mantém o formato do cérebro. */
    hx: number;
    hy: number;
    /** Quantos documentos a estante agrupa. */
    filhos: number;
    /** Documento: a estante que o agrupa e o deslocamento dele em relação a ela (ele acompanha a estante, não entra na física). */
    paiRef?: NoSim;
    dx: number;
    dy: number;
  };
export type LigSim = SimulationLinkDatum<NoSim> & { tipo: TipoDeAresta; source: NoSim | string; target: NoSim | string };
export type SimulacaoDoGrafo = Simulation<NoSim, LigSim>;
export type DadosDoGrafo = { nos: No[]; arestas: Aresta[] };
/** Grafo local: um nó e quantos saltos de vizinhança mostrar a partir dele. */
export type GrafoLocal = { id: string; profundidade: number };
export type Ajustes = {
  centro: number;
  repulsao: number;
  ligacao: number;
  distancia: number;
  tamanho: number;
  espessura: number;
  limiarTexto: number;
  setas: boolean;
  cores: boolean;
  orfaos: boolean;
  /** Pulsos de atividade viajando pelas sinapses (desligados com "reduzir movimento"). */
  pulsos: boolean;
};
export type Vista = { k: number; x: number; y: number };

export const AJUSTES_PADRAO: Ajustes = {
  centro: 0.5,
  repulsao: 10,
  ligacao: 1,
  distancia: 250,
  tamanho: 1,
  espessura: 1,
  limiarTexto: 0,
  setas: false,
  cores: true,
  orfaos: true,
  pulsos: true,
};
export const TIPOS = Object.keys(LEGENDA) as TipoDeNo[];

const PESO: Record<TipoDeNo, number> = {
  nucleo: 12,
  conector: 7,
  estante: 4,
  conhecimento: 1.6,
  documento: 0.3,
  lei: 1,
  nr: 1,
  proposicao: 0.8,
  sistema: 2,
};
const DISTANCIA: Record<TipoDeAresta, number> = {
  especialista: 1.1,
  consulta: 0.8,
  gatilho: 0.6,
  guarda: 0.32,
  cita: 0.2,
  liga: 0.25,
  parecido: 0.35,
  fluxo: 0.5,
};
const FORCA: Record<TipoDeAresta, number> = {
  especialista: 0.9,
  consulta: 0.5,
  gatilho: 0.25,
  guarda: 0.06,
  cita: 0.15,
  liga: 0.05,
  parecido: 0.25,
  fluxo: 0.6,
};
/** Zoom a partir do qual os documentos de todas as estantes aparecem; abaixo disso, só os da estante aberta. */
export const ZOOM_DOS_DOCUMENTOS = 2.6;

/** Raio do nó: a SINDI é a maior; a estante cresce com os documentos que agrupa; o resto, com o número de ligações. */
export function raioBase(n: No, filhos = 0) {
  if (n.tipo === 'nucleo') return 30;
  if (n.tipo === 'conector') return 15;
  if (n.tipo === 'estante') return Math.min(24, 8 + Math.sqrt(filhos) * 0.4);
  if (n.tipo === 'documento') return 1.7;
  return Math.min(11, 3 + Math.sqrt(n.grau) * 0.9);
}
/** Nós centrais (núcleo, conectores, estantes): rótulos mais fortes e sempre à frente na animação. */
export const ehCentral = (n: No) => n.tipo === 'nucleo' || n.tipo === 'conector' || n.tipo === 'estante';
export const dataDoGrafo = (iso?: string) => (iso ? dataBR(iso) : '');
const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Quem se liga a quem, nos dois sentidos. */
export function montarAdjacencia(arestas: Aresta[]) {
  const mapa = new Map<string, Set<string>>();
  const ligar = (de: string, para: string) => {
    (mapa.get(de) ?? mapa.set(de, new Set()).get(de)!).add(para);
  };
  for (const a of arestas) {
    ligar(a.de, a.para);
    ligar(a.para, a.de);
  }
  return mapa;
}

/** Vizinhança de um nó até `profundidade` saltos, restrita aos nós permitidos (como o "Local graph" do Obsidian). */
function alcanceLocal(local: GrafoLocal, permitidos: Set<string>, adjacencia: Map<string, Set<string>>) {
  const alcance = new Set([local.id]);
  let fronteira = [local.id];
  for (let salto = 0; salto < local.profundidade; salto++) {
    const proxima: string[] = [];
    for (const id of fronteira)
      for (const vizinho of adjacencia.get(id) ?? []) {
        if (permitidos.has(vizinho) && !alcance.has(vizinho)) {
          alcance.add(vizinho);
          proxima.push(vizinho);
        }
      }
    fronteira = proxima;
  }
  return alcance;
}

/** Conjunto visível: filtros por tipo, órfãos e, no grafo local, a vizinhança até a profundidade escolhida. */
export function conjuntoVisivel(
  dados: DadosDoGrafo,
  ocultos: Set<TipoDeNo>,
  mostrarOrfaos: boolean,
  local: GrafoLocal | undefined,
  adjacencia: Map<string, Set<string>>,
) {
  let ids = new Set(dados.nos.filter((n) => !ocultos.has(n.tipo) && (mostrarOrfaos || n.grau > 0)).map((n) => n.id));
  if (local && ids.has(local.id)) ids = alcanceLocal(local, ids, adjacencia);
  return { ids, arestas: dados.arestas.filter((a) => ids.has(a.de) && ids.has(a.para)) };
}

/** Até 12 nós visíveis cujo rótulo contém o termo (sem acento nem caixa), os mais ligados primeiro; termos de 1 letra não buscam. */
export function acharNos(dados: DadosDoGrafo, visiveis: Set<string>, busca: string) {
  const termo = semAcento(busca.trim());
  if (termo.length < 2) return [];
  return dados.nos
    .filter((n) => visiveis.has(n.id) && semAcento(n.rotulo).includes(termo))
    .sort((a, b) => b.grau - a.grau)
    .slice(0, 12);
}

/** Ordem dos vizinhos: primeiro os que não são documentos (áreas, estantes, leis), os mais ligados antes; depois os documentos, os mais recentes antes. */
export function ordenarVizinhos<T extends Pick<No, 'tipo' | 'grau' | 'data'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    const docA = a.tipo === 'documento' ? 1 : 0;
    const docB = b.tipo === 'documento' ? 1 : 0;
    if (docA !== docB) return docA - docB;
    return docA ? (b.data ?? '').localeCompare(a.data ?? '') : b.grau - a.grau;
  });
}

/** Os vizinhos mais relevantes de um nó para o painel (até `maximo`); `total` diz quantos existem ao todo. */
export function vizinhosDoNo(
  id: string,
  dados: DadosDoGrafo,
  adjacencia: Map<string, Set<string>>,
  maximo = 15,
  porId: Map<string, No> = new Map(dados.nos.map((n) => [n.id, n])),
) {
  const todos = [...(adjacencia.get(id) ?? [])].map((v) => porId.get(v)).filter((n): n is No => Boolean(n));
  return { lista: ordenarVizinhos(todos).slice(0, maximo), total: todos.length };
}

/**
 * Nós da simulação para o conjunto visível; guardam a posição entre filtros (o grafo não "pula"). Na arquitetura, as posições são fixas. Os
 * documentos ficam presos à estante deles (`paiRef` + deslocamento), então a física só trabalha com a rede pequena.
 */
export function nosDaSimulacao(dados: DadosDoGrafo, visiveis: Set<string>, modo: Modo, memoria: Map<string, NoSim>) {
  const ordemPorData = [...dados.nos].sort(
    (a, b) => (ehCentral(b) ? 1 : 0) - (ehCentral(a) ? 1 : 0) || (a.data ?? '0').localeCompare(b.data ?? '0'),
  );
  const posicaoNaOrdem = new Map(ordemPorData.map((n, i) => [n.id, i]));
  const filhos = new Map<string, number>();
  for (const n of dados.nos) if (n.pai) filhos.set(n.pai, (filhos.get(n.pai) ?? 0) + 1);
  const porId = new Map(dados.nos.map((n) => [n.id, n]));
  const nos = dados.nos
    .filter((n) => visiveis.has(n.id))
    .map((n) => {
      const chave = `${modo}:${n.id}`;
      let no = memoria.get(chave);
      if (!no) {
        no = {
          ...n,
          r: raioBase(n, filhos.get(n.id) ?? 0),
          ordem: posicaoNaOrdem.get(n.id) ?? 0,
          hx: n.x,
          hy: n.y,
          filhos: filhos.get(n.id) ?? 0,
          dx: 0,
          dy: 0,
        };
        if (modo === 'arquitetura') {
          no.fx = n.x;
          no.fy = n.y;
        } else if (n.tipo === 'nucleo') {
          no.fx = n.x;
          no.fy = n.y;
        }
        memoria.set(chave, no);
      }
      return no;
    });
  // Cada documento acompanha a estante: guarda o deslocamento original em relação a ela.
  const porIdSim = new Map(nos.map((n) => [n.id, n]));
  for (const n of nos) {
    const pai = n.pai ? porIdSim.get(n.pai) : undefined;
    n.paiRef = pai;
    if (pai) {
      const origem = porId.get(pai.id)!;
      n.dx = n.hx - origem.x;
      n.dy = n.hy - origem.y;
    }
  }
  return nos;
}

/** Os documentos da lista, para acompanharem a estante a cada quadro. */
export const documentosDaLista = (nos: NoSim[]) => nos.filter((n) => n.tipo === 'documento' && n.paiRef);

/** Põe cada documento no lugar da estante dele (mais o deslocamento): documentos não entram na física. */
export function seguirAsEstantes(documentos: NoSim[]) {
  for (const d of documentos) {
    const pai = d.paiRef!;
    d.x = (pai.x ?? 0) + d.dx;
    d.y = (pai.y ?? 0) + d.dy;
  }
}

/** Os nós que a física move: todos menos os documentos presos a uma estante. */
export const nosDaFisica = (nos: NoSim[]) => nos.filter((n) => !(n.tipo === 'documento' && n.paiRef));

/** Ligações entre nós da física (as que tocam documentos presos não entram na simulação). */
export const ligacoesDaSimulacao = (arestas: Aresta[], fisica?: Set<string>): LigSim[] =>
  arestas
    .filter((a) => !fisica || (fisica.has(a.de) && fisica.has(a.para)))
    .map((a) => ({ source: a.de, target: a.para, tipo: a.tipo }));

/** Forças do painel (mesma ideia dos controles do Obsidian); mexer reaquece a simulação. */
export function aplicarForcas(sim: SimulacaoDoGrafo, a: Ajustes) {
  const escala = a.distancia / 250;
  // Comprimento de repouso da ligação = a distância que ela tem no layout do servidor: o cérebro nasce em equilíbrio e só se deforma quando
  // alguém arrasta um nó (ou mexe nos controles). Na arquitetura, os blocos são fixos e a distância é a de projeto.
  const repouso = (l: LigSim) => {
    const s = l.source as NoSim;
    const t = l.target as NoSim;
    const d = Math.hypot(s.hx - t.hx, s.hy - t.hy);
    return (d > 1 ? d : DISTANCIA[l.tipo] * 220) * escala;
  };
  (sim.force('link') as ReturnType<typeof forceLink<NoSim, LigSim>>)
    .distance(repouso)
    .strength((l) => FORCA[l.tipo] * 0.5 * a.ligacao);
  (sim.force('carga') as ReturnType<typeof forceManyBody<NoSim>>).strength((n) => -a.repulsao * 0.8 * PESO[n.tipo]);
  // A força de centro puxa cada nó para a posição de casa: arrastar estica, soltar faz o nó voltar ao lugar dele no cérebro.
  (sim.force('x') as ReturnType<typeof forceX<NoSim>>).x((n) => n.hx).strength(a.centro * 0.18);
  (sim.force('y') as ReturnType<typeof forceY<NoSim>>).y((n) => n.hy).strength(a.centro * 0.18);
}

/** Física leve: com a rede pequena (cerca de 330 nós) não há "grafo grande"; só o grafo local anima por mais tempo, como no Obsidian. */
export const ehGrafoGrande = (nos: NoSim[], local: GrafoLocal | undefined) => nos.length > 1500 && !local;

export function criarSimulacao(
  nos: NoSim[],
  ligacoes: LigSim[],
  grande: boolean,
  reduzirMovimento: boolean,
  aoMover: () => void,
) {
  return forceSimulation<NoSim, LigSim>(nos)
    .velocityDecay(grande ? 0.5 : 0.4)
    .alphaDecay(reduzirMovimento ? 0.2 : grande ? 0.08 : 0.03)
    .force('link', forceLink<NoSim, LigSim>(ligacoes).id((n) => n.id))
    .force('carga', forceManyBody<NoSim>().theta(grande ? 1.2 : 0.9).distanceMax(grande ? 450 : 500))
    .force('colisao', forceCollide<NoSim>((n) => n.r * 1.5 + 2).strength(0.7))
    .force('x', forceX<NoSim>((n) => n.hx))
    .force('y', forceY<NoSim>((n) => n.hy))
    .on('tick', aoMover);
}

/** Retângulo (no mundo) que a vista enquadra no modo rede: a silhueta inteira do cérebro. */
const LIMITES_DO_CEREBRO = (() => {
  const xs = ELIPSES.flatMap((e) => [e.cx - e.rx, e.cx + e.rx]);
  const ys = ELIPSES.flatMap((e) => [e.cy - e.ry, e.cy + e.ry]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
})();

/** Zoom e deslocamento que enquadram o conteúdo numa área `largura` × `altura`: no modo rede, o cérebro inteiro; na arquitetura, todos os nós. */
export function enquadramento(nos: NoSim[], largura: number, altura: number, modo: Modo = 'arquitetura'): Vista {
  let x0: number, x1: number, y0: number, y1: number;
  if (modo === 'rede') ({ x0, x1, y0, y1 } = LIMITES_DO_CEREBRO);
  else {
    const xs = nos.map((n) => n.x ?? 0);
    const ys = nos.map((n) => n.y ?? 0);
    [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  }
  const k = Math.min(largura / (x1 - x0 + 160), altura / (y1 - y0 + 160), 2.5);
  return { k, x: largura / 2 - ((x0 + x1) / 2) * k, y: altura / 2 - ((y0 + y1) / 2) * k };
}
