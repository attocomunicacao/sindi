'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { grafoDaArquitetura } from '@/lib/grafo/arquitetura';
import { nosParaAcender, type UsoDoCerebro } from '@/lib/chat/uso-do-cerebro';
import type { Grafo, TipoDeNo } from '@/lib/grafo/tipos';
import { CHAVE_DO_ULTIMO_USO, esquecerUltimoUso, lerUltimoUso } from '@/componentes/cerebro/ultimo-uso';
import { desenharQuadro, estadoInicialDoGrafo, type EstadoDoGrafo } from '@/componentes/cerebro/desenho-do-grafo';
import { ligarInteracao } from '@/componentes/cerebro/interacao-do-grafo';
import {
  acharNos,
  AJUSTES_PADRAO,
  aplicarForcas,
  conjuntoVisivel,
  criarSimulacao,
  dataDoGrafo,
  documentosDaLista,
  ehGrafoGrande,
  enquadramento,
  ligacoesDaSimulacao,
  montarAdjacencia,
  nosDaFisica,
  nosDaSimulacao,
  TIPOS,
  vizinhosDoNo,
  type Ajustes,
  type DadosDoGrafo,
  type GrafoLocal,
  type Modo,
  type NoSim,
  type SimulacaoDoGrafo,
} from '@/componentes/cerebro/layout-do-grafo';

const MENSAGEM_SEM_GRAFO =
  'O grafo do cérebro ainda não está disponível. Ele é gerado ao fim de cada coleta (npm run grafo:gerar).';

type RefDoEstado = RefObject<EstadoDoGrafo>;
type RefDoCanvas = RefObject<HTMLCanvasElement | null>;
/** Pede o próximo quadro de desenho; o laço de desenho troca a função assim que monta. */
type RefDoAcordar = RefObject<() => void>;

// As funções abaixo mexem nos refs (estado de desenho, simulação), o que a regra de imutabilidade do React proíbe dentro de hooks que
// recebem refs por parâmetro; por isso são funções comuns, chamadas de dentro dos efeitos de useGrafo.

const NOME_DA_ORIGEM: Record<string, string> = {
  cerebro: 'conhecimento da equipe',
  biblioteca: 'biblioteca',
  grafo: 'grafo de leis e projetos',
  externa: 'fontes públicas',
  documento: 'documentos oficiais',
  ferramenta: 'ferramenta do site',
  contato: 'contato do sindicato',
};
/** Frase curta do que a última resposta do chat usou (a área e de onde vieram as fontes), para o aviso acima do cérebro. */
function descreverUso(uso: UsoDoCerebro, rede: Grafo | undefined) {
  const area = uso.conector ? rede?.nos.find((n) => n.id === `conector:${uso.conector}`)?.rotulo : undefined;
  const origens = uso.origens.map((o) => NOME_DA_ORIGEM[o] ?? o);
  return [
    area ? `área: ${area}` : 'sem área específica',
    origens.length ? `fontes: ${origens.join(', ')}` : 'sem fontes (resposta por regra)',
  ].join(' · ');
}

/** Baixa o grafo do cérebro; devolve o cancelamento para o efeito que a chamou. */
function baixarGrafo(aoChegar: (rede: Grafo) => void, aoFalhar: (mensagem: string) => void) {
  const controle = new AbortController();
  fetch('/api/cerebro/grafo', { signal: controle.signal })
    .then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      aoChegar(j as Grafo);
    })
    .catch((e) => {
      if (e.name !== 'AbortError') aoFalhar(MENSAGEM_SEM_GRAFO);
    });
  return () => controle.abort();
}

type EntradaDaSimulacao = {
  dados: DadosDoGrafo;
  visivel: NonNullable<ReturnType<typeof conjuntoVisivel>>;
  modo: Modo;
  local?: GrafoLocal;
  estado: RefDoEstado;
  simulacao: RefObject<SimulacaoDoGrafo | undefined>;
  acordar: RefDoAcordar;
  memoria: RefObject<Map<string, NoSim>>;
};

/** Refaz a simulação para o conjunto visível (os nós guardam a posição entre filtros, o grafo não "pula"); devolve a função que a para. */
function refazerSimulacao({ dados, visivel, modo, local, estado, simulacao, acordar, memoria }: EntradaDaSimulacao) {
  const e = estado.current;
  e.modo = modo;
  const nos = nosDaSimulacao(dados, visivel.ids, modo, memoria.current);
  // A física só move a rede pequena; os documentos acompanham a estante (seguirAsEstantes, a cada quadro) e suas ligações não entram na simulação.
  const fisica = nosDaFisica(nos);
  const idsDaFisica = new Set(fisica.map((n) => n.id));
  const ligacoes = ligacoesDaSimulacao(visivel.arestas, idsDaFisica);
  const todasAsLigacoes = ligacoesDaSimulacao(visivel.arestas);
  Object.assign(e, {
    nos,
    ligacoes: todasAsLigacoes,
    vizinhos: montarAdjacencia(visivel.arestas),
    documentos: documentosDaLista(nos),
    porId: new Map(nos.map((n) => [n.id, n])),
    dica: undefined,
  });
  simulacao.current?.stop();
  const grande = ehGrafoGrande(fisica, local);
  e.grande = grande;
  const sim = criarSimulacao(fisica, ligacoes, grande, e.reduzir, () => acordar.current());
  simulacao.current = sim;
  aplicarForcas(sim, e.ajustes);
  sim.alpha(local ? 0.9 : grande ? 0.05 : 0.25).restart();
  acordar.current();
  return () => {
    sim.stop();
  };
}

/** Aplica as forças dos ajustes à simulação em curso e a reaquece. */
function reajustarForcas(
  ajustes: Ajustes,
  estado: RefDoEstado,
  simulacao: RefObject<SimulacaoDoGrafo | undefined>,
  acordar: RefDoAcordar,
) {
  estado.current.ajustes = ajustes;
  const sim = simulacao.current;
  if (!sim) return;
  aplicarForcas(sim, ajustes);
  sim.alpha(Math.max(sim.alpha(), estado.current.grande ? 0.15 : 0.35)).restart();
  acordar.current();
}

/** Enquadra a vista em todos os nós; `imediato` pula a animação do zoom. */
function enquadrarNos(canvas: RefDoCanvas, estado: RefDoEstado, acordar: RefDoAcordar, imediato: boolean) {
  const c = canvas.current;
  const e = estado.current;
  if (!c || !e.nos.length) return;
  e.alvo = enquadramento(e.nos, c.clientWidth, c.clientHeight, e.modo);
  if (imediato) e.vista = { ...e.alvo };
  acordar.current();
}

/** Desenho contínuo enquanto houver movimento (física, zoom suave, esmaecimento, animação); parado, não gasta processador. */
function iniciarDesenho(canvas: RefDoCanvas, estado: RefDoEstado, acordar: RefDoAcordar) {
  const c = canvas.current;
  if (!c) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const e = estado.current;
  const desenhar = () => {
    e.quadro = 0;
    if (desenharQuadro(c, ctx, e)) e.quadro = requestAnimationFrame(desenhar);
  };
  acordar.current = () => {
    if (!e.quadro) e.quadro = requestAnimationFrame(desenhar);
  };
  acordar.current();
  const redimensionar = new ResizeObserver(() => acordar.current());
  redimensionar.observe(c);
  return () => {
    cancelAnimationFrame(e.quadro);
    e.quadro = 0;
    redimensionar.disconnect();
  };
}

/**
 * O cérebro como o "Graph view" do Obsidian: física ao vivo (d3-force no navegador, partindo das posições calculadas no servidor), nós que se arrastam
 * puxando os vizinhos, esmaecimento suave ao passar o mouse, rótulos que surgem com o zoom, grafo local por profundidade, animação em linha do tempo
 * e o mesmo painel de ajustes (Filtros, Grupos, Exibição, Forças). Este hook liga o estado do React ao canvas; a lógica fica em layout-do-grafo.ts,
 * o desenho em desenho-do-grafo.ts e o ponteiro em interacao-do-grafo.ts.
 */
export function useGrafo() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('rede');
  const [ocultos, setOcultos] = useState<Set<TipoDeNo>>(new Set());
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<NoSim>();
  const [local, setLocal] = useState<GrafoLocal>();
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO);
  const [painelAberto, setPainelAberto] = useState(true);
  const [rede, setRede] = useState<Grafo>();
  const [erro, setErro] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulacao = useRef<SimulacaoDoGrafo>(undefined);
  const estado = useRef(estadoInicialDoGrafo(AJUSTES_PADRAO));
  const acordar = useRef<() => void>(() => {});
  const memoria = useRef(new Map<string, NoSim>());
  const [usoRecente, setUsoRecente] = useState<UsoDoCerebro>();
  useEffect(() => {
    estado.current.reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return baixarGrafo(setRede, setErro);
  }, []);

  const arquitetura = useMemo(() => grafoDaArquitetura(), []);
  const dados: DadosDoGrafo | undefined = modo === 'arquitetura' ? arquitetura : rede;
  // Adjacência completa (para o grafo local e a lista de vizinhos).
  const adjacencia = useMemo(() => montarAdjacencia(dados?.arestas ?? []), [dados]);
  const visivel = useMemo(
    () => dados && conjuntoVisivel(dados, ocultos, ajustes.orfaos, local, adjacencia),
    [dados, ocultos, ajustes.orfaos, local, adjacencia],
  );
  const achados = useMemo(() => (dados && visivel ? acharNos(dados, visivel.ids, busca) : []), [busca, dados, visivel]);

  // Simulação: refeita quando muda o conjunto visível; as forças e o destaque acompanham os ajustes, a busca e a seleção.
  useEffect(() => {
    if (!dados || !visivel) return;
    return refazerSimulacao({ dados, visivel, modo, local, estado, simulacao, acordar, memoria });
  }, [dados, visivel, modo, local]);
  useEffect(() => reajustarForcas(ajustes, estado, simulacao, acordar), [ajustes]);
  useEffect(() => {
    estado.current.destaque = new Set(achados.map((n) => n.id));
    acordar.current();
  }, [achados]);
  useEffect(() => {
    estado.current.selecionado = selecionado;
    // Selecionar uma estante (ou um documento dela) abre a nuvem de documentos; nada selecionado, recolhe.
    const aberta = selecionado?.tipo === 'estante' ? selecionado.id : selecionado?.paiRef?.id;
    estado.current.expandidas = new Set(aberta ? [aberta] : []);
    acordar.current();
  }, [selecionado]);

  const enquadrar = useCallback((imediato = false) => enquadrarNos(canvas, estado, acordar, imediato), []);
  // A última resposta do chat acende o caminho SINDI → área → estante/conhecimento (também quando o chat responde em outra aba).
  useEffect(() => {
    const ler = () => setUsoRecente(lerUltimoUso());
    ler();
    const aoMudar = (ev: StorageEvent) => {
      if (ev.key === CHAVE_DO_ULTIMO_USO || ev.key === null) ler();
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, []);
  useEffect(() => {
    estado.current.ativos = modo === 'rede' && usoRecente ? new Set(nosParaAcender(usoRecente)) : new Set();
    acordar.current();
  }, [usoRecente, modo, rede]);

  useEffect(() => {
    const t = setTimeout(() => enquadrar(true), 30);
    return () => clearTimeout(t);
  }, [modo, rede, local, enquadrar]);
  useEffect(() => iniciarDesenho(canvas, estado, acordar), []);
  // Parado, o canvas não redesenha sozinho: ao trocar o tema (data-theme no <html>) pedimos um quadro para ele pegar a paleta nova.
  useEffect(() => {
    const observador = new MutationObserver(() => acordar.current());
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observador.disconnect();
  }, []);

  /** Leva a vista até o nó, com pelo menos o zoom de 1,4 (os documentos de uma estante só aparecem ao aproximar ou ao abri-la). */
  const centrarNo = useCallback((no: NoSim) => {
    const c = canvas.current;
    const e = estado.current;
    if (!c) return;
    const k = Math.max(e.alvo.k, 1.4);
    e.alvo = { k, x: c.clientWidth / 2 - (no.x ?? 0) * k, y: c.clientHeight / 2 - (no.y ?? 0) * k };
    acordar.current();
  }, []);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    return ligarInteracao(c, {
      estado: estado.current,
      simulacao,
      acordar,
      aoSelecionar: setSelecionado,
      aoCentrar: centrarNo,
      aoAbrir: (endereco) => router.push(endereco),
    });
  }, [router, centrarNo]);

  const centrarEm = (id: string) => {
    const no = estado.current.porId.get(id);
    if (!no) return;
    centrarNo(no);
    setSelecionado(no);
  };
  const animar = () => {
    estado.current.revelados = 0;
    acordar.current();
  };
  const trocarModo = (novo: Modo) => {
    setModo(novo);
    setSelecionado(undefined);
    setLocal(undefined);
  };
  const mudarAjuste =
    <K extends keyof Ajustes>(chave: K) =>
    (valor: Ajustes[K]) =>
      setAjustes((a) => ({ ...a, [chave]: valor }));
  const alternarTipo = (tipo: TipoDeNo) =>
    setOcultos((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(tipo)) novos.delete(tipo);
      else novos.add(tipo);
      return novos;
    });
  const totais = rede
    ? `${rede.nos.length.toLocaleString('pt-BR')} nós · ${rede.arestas.length.toLocaleString('pt-BR')} ligações · gerado em ${dataDoGrafo(rede.geradoEm)}`
    : '';

  // A ref do canvas vai separada do resto: só o elemento da tela precisa dela, e o painel recebe o estado sem ela.
  return {
    canvas,
    grafo: {
      modo,
      trocarModo,
      erro,
      totais,
      usoRecente,
      textoDoUsoRecente: usoRecente && modo === 'rede' ? descreverUso(usoRecente, rede) : '',
      limparUsoRecente: () => {
        esquecerUltimoUso();
        setUsoRecente(undefined);
      },
      selecionado,
      setSelecionado,
      local,
      setLocal,
      vizinhos: selecionado && dados ? vizinhosDoNo(selecionado.id, dados, adjacencia) : { lista: [], total: 0 },
      busca,
      setBusca,
      achados,
      centrarEm,
      enquadrar,
      animar,
      ajustes,
      mudarAjuste,
      restaurarAjustes: () => setAjustes(AJUSTES_PADRAO),
      ocultos,
      alternarTipo,
      tiposPresentes: TIPOS.filter((t) => dados?.nos.some((n) => n.tipo === t)),
      contagemDoTipo: (tipo: TipoDeNo) => dados?.nos.filter((n) => n.tipo === tipo).length.toLocaleString('pt-BR'),
      painelAberto,
      alternarPainel: () => setPainelAberto((aberto) => !aberto),
    },
  };
}
