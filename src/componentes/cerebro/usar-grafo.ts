'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { grafoDaArquitetura } from '@/lib/grafo/arquitetura';
import type { Grafo, TipoDeNo } from '@/lib/grafo/tipos';
import { desenharQuadro, estadoInicialDoGrafo } from '@/componentes/cerebro/desenho-do-grafo';
import { ligarInteracao } from '@/componentes/cerebro/interacao-do-grafo';
import {
  acharNos, AJUSTES_PADRAO, aplicarForcas, conjuntoVisivel, criarSimulacao, dataDoGrafo, ehGrafoGrande, enquadramento, ligacoesDaSimulacao,
  montarAdjacencia, nosDaSimulacao, TIPOS, vizinhosDoNo, type Ajustes, type DadosDoGrafo, type GrafoLocal, type Modo, type NoSim, type SimulacaoDoGrafo,
} from '@/componentes/cerebro/layout-do-grafo';

const MENSAGEM_SEM_GRAFO = 'O grafo do cérebro ainda não está disponível. Ele é gerado ao fim de cada coleta (npm run grafo:gerar).';

/**
 * O cérebro como o "Graph view" do Obsidian: física ao vivo (d3-force no navegador, partindo das posições calculadas no servidor), nós que se arrastam
 * puxando os vizinhos, esmaecimento suave ao passar o mouse, rótulos que surgem com o zoom, grafo local por profundidade, animação em linha do tempo
 * e o mesmo painel de ajustes (Filtros, Grupos, Exibição, Forças). Este hook liga o estado do React ao canvas; a lógica fica em layout-do-grafo.ts,
 * o desenho em desenho-do-grafo.ts e o ponteiro em interacao-do-grafo.ts.
 */
export function useGrafo() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('rede');
  const [rede, setRede] = useState<Grafo>();
  const [erro, setErro] = useState('');
  const [ocultos, setOcultos] = useState<Set<TipoDeNo>>(new Set());
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<NoSim>();
  const [local, setLocal] = useState<GrafoLocal>();
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO);
  const [painelAberto, setPainelAberto] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulacao = useRef<SimulacaoDoGrafo>(undefined);
  const estado = useRef(estadoInicialDoGrafo(AJUSTES_PADRAO));
  const acordar = useRef<() => void>(() => {});
  const memoria = useRef(new Map<string, NoSim>());

  useEffect(() => {
    const controle = new AbortController();
    fetch('/api/cerebro/grafo', { signal: controle.signal }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setRede(j as Grafo); })
      .catch(e => { if (e.name !== 'AbortError') setErro(MENSAGEM_SEM_GRAFO); });
    estado.current.reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => controle.abort();
  }, []);

  const arquitetura = useMemo(() => grafoDaArquitetura(), []);
  const dados: DadosDoGrafo | undefined = modo === 'arquitetura' ? arquitetura : rede;
  // Adjacência completa (para o grafo local e a lista de vizinhos).
  const adjacencia = useMemo(() => montarAdjacencia(dados?.arestas ?? []), [dados]);
  const visivel = useMemo(() => dados && conjuntoVisivel(dados, ocultos, ajustes.orfaos, local, adjacencia), [dados, ocultos, ajustes.orfaos, local, adjacencia]);
  const achados = useMemo(() => (dados && visivel ? acharNos(dados, visivel.ids, busca) : []), [busca, dados, visivel]);

  // Simulação: refeita quando muda o conjunto visível; os nós guardam a posição entre filtros (o grafo não "pula").
  useEffect(() => {
    if (!dados || !visivel) return;
    const e = estado.current;
    e.modo = modo;
    const nos = nosDaSimulacao(dados, visivel.ids, modo, memoria.current);
    const ligacoes = ligacoesDaSimulacao(visivel.arestas);
    Object.assign(e, { nos, ligacoes, vizinhos: montarAdjacencia(visivel.arestas) });
    simulacao.current?.stop();
    const grande = ehGrafoGrande(nos, local);
    e.grande = grande;
    const sim = criarSimulacao(nos, ligacoes, grande, e.reduzir, () => acordar.current());
    simulacao.current = sim;
    aplicarForcas(sim, e.ajustes);
    sim.alpha(local ? 0.9 : grande ? 0.05 : 0.25).restart();
    acordar.current();
    return () => { sim.stop(); };
  }, [dados, visivel, modo, local]);

  useEffect(() => {
    estado.current.ajustes = ajustes;
    const sim = simulacao.current;
    if (!sim) return;
    aplicarForcas(sim, ajustes);
    sim.alpha(Math.max(sim.alpha(), estado.current.grande ? 0.15 : 0.35)).restart();
    acordar.current();
  }, [ajustes]);
  useEffect(() => { estado.current.destaque = new Set(achados.map(n => n.id)); acordar.current(); }, [achados]);
  useEffect(() => { estado.current.selecionado = selecionado; acordar.current(); }, [selecionado]);

  const enquadrar = useCallback((imediato = false) => {
    const c = canvas.current; const e = estado.current;
    if (!c || !e.nos.length) return;
    e.alvo = enquadramento(e.nos, c.clientWidth, c.clientHeight);
    if (imediato) e.vista = { ...e.alvo };
    acordar.current();
  }, []);
  useEffect(() => { const t = setTimeout(() => enquadrar(true), 30); return () => clearTimeout(t); }, [modo, rede, local, enquadrar]);

  // Desenho contínuo enquanto houver movimento (física, zoom suave, esmaecimento, animação); parado, não gasta processador.
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const e = estado.current;
    const desenhar = () => {
      e.quadro = 0;
      if (desenharQuadro(c, ctx, e)) e.quadro = requestAnimationFrame(desenhar);
    };
    acordar.current = () => { if (!e.quadro) e.quadro = requestAnimationFrame(desenhar); };
    acordar.current();
    const redimensionar = new ResizeObserver(() => acordar.current());
    redimensionar.observe(c);
    return () => { cancelAnimationFrame(e.quadro); e.quadro = 0; redimensionar.disconnect(); };
  }, []);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    return ligarInteracao(c, { estado: estado.current, simulacao, acordar, aoSelecionar: setSelecionado, aoAbrir: endereco => router.push(endereco) });
  }, [router]);

  const centrarEm = (id: string) => {
    const c = canvas.current; const e = estado.current;
    const no = e.nos.find(n => n.id === id);
    if (!c || !no) return;
    const k = Math.max(e.alvo.k, 1.4);
    e.alvo = { k, x: c.clientWidth / 2 - (no.x ?? 0) * k, y: c.clientHeight / 2 - (no.y ?? 0) * k };
    setSelecionado(no); acordar.current();
  };
  const animar = () => { estado.current.revelados = 0; acordar.current(); };
  const trocarModo = (novo: Modo) => { setModo(novo); setSelecionado(undefined); setLocal(undefined); };
  const mudarAjuste = <K extends keyof Ajustes>(chave: K) => (valor: Ajustes[K]) => setAjustes(a => ({ ...a, [chave]: valor }));
  const alternarTipo = (tipo: TipoDeNo) => setOcultos(atuais => { const novos = new Set(atuais); if (novos.has(tipo)) novos.delete(tipo); else novos.add(tipo); return novos; });
  const totais = rede ? `${rede.nos.length.toLocaleString('pt-BR')} nós · ${rede.arestas.length.toLocaleString('pt-BR')} ligações · gerado em ${dataDoGrafo(rede.geradoEm)}` : '';

  // A ref do canvas vai separada do resto: só o elemento da tela precisa dela, e o painel recebe o estado sem ela.
  return {
    canvas,
    grafo: {
      modo, trocarModo, erro, totais,
      selecionado, setSelecionado, local, setLocal, vizinhos: selecionado && dados ? vizinhosDoNo(selecionado.id, dados, adjacencia) : [],
      busca, setBusca, achados, centrarEm, enquadrar, animar,
      ajustes, mudarAjuste, restaurarAjustes: () => setAjustes(AJUSTES_PADRAO),
      ocultos, alternarTipo, tiposPresentes: TIPOS.filter(t => dados?.nos.some(n => n.tipo === t)),
      contagemDoTipo: (tipo: TipoDeNo) => dados?.nos.filter(n => n.tipo === tipo).length.toLocaleString('pt-BR'),
      painelAberto, alternarPainel: () => setPainelAberto(aberto => !aberto),
    },
  };
}
