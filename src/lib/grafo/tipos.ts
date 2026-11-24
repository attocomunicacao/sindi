// Sem dependências: o formato do grafo é lido pelo navegador (/cerebro) e pelo servidor (chat).
/**
 * O cérebro da SINDI como rede: o núcleo (a SINDI), os especialistas (conectores), as estantes da biblioteca, o conhecimento escrito pela equipe,
 * os documentos coletados e as entidades (leis, NRs, projetos) que os ligam. Só títulos, tipos e ligações — nenhum conteúdo integral, mensagem ou IP.
 */
export type TipoDeNo =
  'nucleo' | 'conector' | 'estante' | 'conhecimento' | 'documento' | 'lei' | 'nr' | 'proposicao' | 'sistema';
export type TipoDeAresta = 'especialista' | 'consulta' | 'gatilho' | 'guarda' | 'cita' | 'liga' | 'parecido' | 'fluxo';
export type No = {
  id: string;
  tipo: TipoDeNo;
  rotulo: string;
  /** Agrupamento para a cor (ala da estante, fonte do documento, tipo da entidade). */
  grupo: string;
  /** Endereço dentro do site (/base/...) para abrir o nó; documentos externos levam ao leitor da biblioteca. */
  href?: string;
  /** Data do documento (ISO), quando houver. */
  data?: string;
  /** Posição pré-calculada (a página só desenha). */
  x: number;
  y: number;
  /** Número de ligações. */
  grau: number;
  /** Região do cérebro onde o nó mora: o id da área (conector), "geral" ou "sindi". Todo nó da rede de conhecimento tem uma. */
  regiao?: string;
  /** Profundidade na hierarquia: 0 SINDI, 1 área, 2 estante e conhecimento, 3 lei/NR/projeto, 4 documento. */
  nivel?: number;
  /** Quem agrupa o nó: o documento aponta para a estante em que está catalogado. */
  pai?: string;
};
export type Aresta = { de: string; para: string; tipo: TipoDeAresta; peso: number };
export type Grafo = { versao: 1; geradoEm: string; nos: No[]; arestas: Aresta[]; resumo: Record<TipoDeNo, number> };

/** Rótulos e cores por tipo (a página e o cofre do Obsidian usam a mesma legenda). */
export const LEGENDA: Record<TipoDeNo, { nome: string; cor: string }> = {
  nucleo: { nome: 'SINDI', cor: '#ebb92e' },
  conector: { nome: 'Especialistas (áreas)', cor: '#ef4444' },
  estante: { nome: 'Estantes da biblioteca', cor: '#a855f7' },
  conhecimento: { nome: 'Conhecimento da equipe', cor: '#22c55e' },
  documento: { nome: 'Documentos coletados', cor: '#38bdf8' },
  lei: { nome: 'Leis citadas', cor: '#eab308' },
  nr: { nome: 'Normas regulamentadoras', cor: '#fb923c' },
  proposicao: { nome: 'Projetos de lei', cor: '#f472b6' },
  sistema: { nome: 'Arquitetura do sistema', cor: '#94a3b8' },
};
