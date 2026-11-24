// Lógica do grafo sem DOM: tipos, conjuntos visíveis, busca e a simulação de forças (d3-force). O desenho fica em desenho-do-grafo.ts.
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { LEGENDA, type Aresta, type No, type TipoDeAresta, type TipoDeNo } from '@/lib/grafo/tipos';

export type Modo = 'rede' | 'arquitetura';
export type NoSim = SimulationNodeDatum & No & { r: number; ordem: number };
export type LigSim = SimulationLinkDatum<NoSim> & { tipo: TipoDeAresta; source: NoSim | string; target: NoSim | string };
export type SimulacaoDoGrafo = Simulation<NoSim, LigSim>;
export type DadosDoGrafo = { nos: No[]; arestas: Aresta[] };
/** Grafo local: um nó e quantos saltos de vizinhança mostrar a partir dele. */
export type GrafoLocal = { id: string; profundidade: number };
export type Ajustes = { centro: number; repulsao: number; ligacao: number; distancia: number; tamanho: number; espessura: number; limiarTexto: number; setas: boolean; cores: boolean; orfaos: boolean };
export type Vista = { k: number; x: number; y: number };

export const AJUSTES_PADRAO: Ajustes = { centro: 0.5, repulsao: 10, ligacao: 1, distancia: 250, tamanho: 1, espessura: 1, limiarTexto: 0, setas: false, cores: true, orfaos: true };
export const TIPOS = Object.keys(LEGENDA) as TipoDeNo[];

const PESO: Record<TipoDeNo, number> = { nucleo: 12, conector: 7, estante: 4, conhecimento: 1.6, documento: 0.3, lei: 1, nr: 1, proposicao: 0.8, sistema: 2 };
const DISTANCIA: Record<TipoDeAresta, number> = { especialista: 1.1, consulta: 0.8, gatilho: 0.6, guarda: 0.32, cita: 0.2, liga: 0.25, parecido: 0.35, fluxo: 0.5 };
const FORCA: Record<TipoDeAresta, number> = { especialista: 0.9, consulta: 0.5, gatilho: 0.25, guarda: 0.06, cita: 0.15, liga: 0.05, parecido: 0.25, fluxo: 0.6 };
/** Acima disto (e fora do grafo local) o grafo é tratado como "grande": a física começa quase assentada e roda mais leve. */
const NOS_DE_GRAFO_GRANDE = 1500;

export const raioBase = (n: No) => (n.tipo === 'nucleo' ? 14 : Math.min(18, 2.2 + Math.sqrt(n.grau) * (n.tipo === 'documento' ? 0.6 : 1.1)));
/** Nós centrais (núcleo, conectores, estantes): rótulos mais fortes e sempre à frente na animação. */
export const ehCentral = (n: No) => n.tipo === 'nucleo' || n.tipo === 'conector' || n.tipo === 'estante';
export const dataDoGrafo = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Quem se liga a quem, nos dois sentidos. */
export function montarAdjacencia(arestas: Aresta[]) {
  const mapa = new Map<string, Set<string>>();
  const ligar = (de: string, para: string) => { (mapa.get(de) ?? mapa.set(de, new Set()).get(de)!).add(para); };
  for (const a of arestas) { ligar(a.de, a.para); ligar(a.para, a.de); }
  return mapa;
}

/** Vizinhança de um nó até `profundidade` saltos, restrita aos nós permitidos (como o "Local graph" do Obsidian). */
function alcanceLocal(local: GrafoLocal, permitidos: Set<string>, adjacencia: Map<string, Set<string>>) {
  const alcance = new Set([local.id]);
  let fronteira = [local.id];
  for (let salto = 0; salto < local.profundidade; salto++) {
    const proxima: string[] = [];
    for (const id of fronteira) for (const vizinho of adjacencia.get(id) ?? []) {
      if (permitidos.has(vizinho) && !alcance.has(vizinho)) { alcance.add(vizinho); proxima.push(vizinho); }
    }
    fronteira = proxima;
  }
  return alcance;
}

/** Conjunto visível: filtros por tipo, órfãos e, no grafo local, a vizinhança até a profundidade escolhida. */
export function conjuntoVisivel(dados: DadosDoGrafo, ocultos: Set<TipoDeNo>, mostrarOrfaos: boolean, local: GrafoLocal | undefined, adjacencia: Map<string, Set<string>>) {
  let ids = new Set(dados.nos.filter(n => !ocultos.has(n.tipo) && (mostrarOrfaos || n.grau > 0)).map(n => n.id));
  if (local && ids.has(local.id)) ids = alcanceLocal(local, ids, adjacencia);
  return { ids, arestas: dados.arestas.filter(a => ids.has(a.de) && ids.has(a.para)) };
}

/** Até 12 nós visíveis cujo rótulo contém o termo (sem acento nem caixa), os mais ligados primeiro; termos de 1 letra não buscam. */
export function acharNos(dados: DadosDoGrafo, visiveis: Set<string>, busca: string) {
  const termo = semAcento(busca.trim());
  if (termo.length < 2) return [];
  return dados.nos.filter(n => visiveis.has(n.id) && semAcento(n.rotulo).includes(termo)).sort((a, b) => b.grau - a.grau).slice(0, 12);
}

/** Vizinhos do nó selecionado, os mais ligados primeiro (até 15). */
export function vizinhosDoNo(id: string, dados: DadosDoGrafo, adjacencia: Map<string, Set<string>>) {
  return [...(adjacencia.get(id) ?? [])].map(vizinho => dados.nos.find(n => n.id === vizinho)!).filter(Boolean).sort((a, b) => b.grau - a.grau).slice(0, 15);
}

/** Nós da simulação para o conjunto visível; guardam a posição entre filtros (o grafo não "pula"). Na arquitetura, as posições são fixas. */
export function nosDaSimulacao(dados: DadosDoGrafo, visiveis: Set<string>, modo: Modo, memoria: Map<string, NoSim>) {
  const ordemPorData = [...dados.nos].sort((a, b) => (ehCentral(b) ? 1 : 0) - (ehCentral(a) ? 1 : 0) || (a.data ?? '0').localeCompare(b.data ?? '0'));
  const posicaoNaOrdem = new Map(ordemPorData.map((n, i) => [n.id, i]));
  return dados.nos.filter(n => visiveis.has(n.id)).map(n => {
    const chave = `${modo}:${n.id}`;
    let no = memoria.get(chave);
    if (!no) {
      no = { ...n, r: raioBase(n), ordem: posicaoNaOrdem.get(n.id) ?? 0 };
      if (modo === 'arquitetura') { no.fx = n.x; no.fy = n.y; }
      memoria.set(chave, no);
    }
    return no;
  });
}

export const ligacoesDaSimulacao = (arestas: Aresta[]): LigSim[] => arestas.map(a => ({ source: a.de, target: a.para, tipo: a.tipo }));

/** Forças do painel (mesma ideia dos controles do Obsidian); mexer reaquece a simulação. */
export function aplicarForcas(sim: SimulacaoDoGrafo, a: Ajustes) {
  const escala = a.distancia / 250;
  (sim.force('link') as ReturnType<typeof forceLink<NoSim, LigSim>>).distance(l => DISTANCIA[l.tipo] * 220 * escala).strength(l => FORCA[l.tipo] * a.ligacao);
  (sim.force('carga') as ReturnType<typeof forceManyBody<NoSim>>).strength(n => -a.repulsao * 6 * PESO[n.tipo]);
  (sim.force('x') as ReturnType<typeof forceX<NoSim>>).strength(a.centro * 0.035);
  (sim.force('y') as ReturnType<typeof forceY<NoSim>>).strength(a.centro * 0.035);
}

export const ehGrafoGrande = (nos: NoSim[], local: GrafoLocal | undefined) => nos.length > NOS_DE_GRAFO_GRANDE && !local;

/**
 * Grafo grande (milhares de documentos): as posições já vêm prontas do servidor, então a física começa quase assentada e se acomoda depressa;
 * cada passo com 6 mil corpos custa caro no navegador. Grafo local e pequeno animam por mais tempo, como no Obsidian.
 */
export function criarSimulacao(nos: NoSim[], ligacoes: LigSim[], grande: boolean, reduzirMovimento: boolean, aoMover: () => void) {
  return forceSimulation<NoSim, LigSim>(nos).velocityDecay(grande ? 0.5 : 0.35).alphaDecay(reduzirMovimento ? 0.2 : grande ? 0.08 : 0.025)
    .force('link', forceLink<NoSim, LigSim>(ligacoes).id(n => n.id))
    .force('carga', forceManyBody<NoSim>().theta(grande ? 1.2 : 0.9).distanceMax(grande ? 450 : 700))
    .force('x', forceX<NoSim>(0)).force('y', forceY<NoSim>(0))
    .on('tick', aoMover);
}

/** Zoom e deslocamento que enquadram todos os nós numa área `largura` × `altura`. */
export function enquadramento(nos: NoSim[], largura: number, altura: number): Vista {
  const xs = nos.map(n => n.x ?? 0);
  const ys = nos.map(n => n.y ?? 0);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(largura / (x1 - x0 + 160), altura / (y1 - y0 + 160), 2.5);
  return { k, x: largura / 2 - ((x0 + x1) / 2) * k, y: altura / 2 - ((y0 + y1) / 2) * k };
}
