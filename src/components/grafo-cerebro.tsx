'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { Crosshair, Network, Play, RotateCcw, Search, Settings2, Workflow, X } from 'lucide-react';
import { grafoDaArquitetura } from '@/lib/grafo/arquitetura';
import { LEGENDA, type Aresta, type Grafo, type No, type TipoDeAresta, type TipoDeNo } from '@/lib/grafo/tipos';

/**
 * O cérebro como o "Graph view" do Obsidian: física ao vivo (d3-force no navegador, partindo das posições calculadas no servidor), nós que se arrastam
 * puxando os vizinhos, esmaecimento suave ao passar o mouse, rótulos que surgem com o zoom, grafo local por profundidade, animação em linha do tempo
 * e o mesmo painel de ajustes (Filtros, Grupos, Exibição, Forças). Desenho em Canvas 2D próprio: compatível com a CSP (nada de `style=` no servidor,
 * nenhum worker) e leve com milhares de nós (ligações desenhadas em lote, nós fora da tela ignorados).
 */
type Modo = 'rede' | 'arquitetura';
type NoSim = SimulationNodeDatum & No & { r: number; ordem: number };
type LigSim = SimulationLinkDatum<NoSim> & { tipo: TipoDeAresta; source: NoSim | string; target: NoSim | string };
type Ajustes = { centro: number; repulsao: number; ligacao: number; distancia: number; tamanho: number; espessura: number; limiarTexto: number; setas: boolean; cores: boolean; orfaos: boolean };
const PADRAO: Ajustes = { centro: 0.5, repulsao: 10, ligacao: 1, distancia: 250, tamanho: 1, espessura: 1, limiarTexto: 0, setas: false, cores: true, orfaos: true };
// Paleta do tema escuro do Obsidian.
const FUNDO = '#1e1e1e'; const NO_NEUTRO = '#9e9e9e'; const LINHA = 'rgba(120,120,120,0.35)'; const ACENTO = '#a882ff'; const TEXTO = '#dadada';
const TIPOS = Object.keys(LEGENDA) as TipoDeNo[];
const PESO: Record<TipoDeNo, number> = { nucleo: 12, conector: 7, estante: 4, conhecimento: 1.6, documento: 0.3, lei: 1, nr: 1, proposicao: 0.8, sistema: 2 };
const DISTANCIA: Record<TipoDeAresta, number> = { especialista: 1.1, consulta: 0.8, gatilho: 0.6, guarda: 0.32, cita: 0.2, liga: 0.25, parecido: 0.35, fluxo: 0.5 };
const FORCA: Record<TipoDeAresta, number> = { especialista: 0.9, consulta: 0.5, gatilho: 0.25, guarda: 0.06, cita: 0.15, liga: 0.05, parecido: 0.25, fluxo: 0.6 };
const raioBase = (n: No) => (n.tipo === 'nucleo' ? 14 : Math.min(18, 2.2 + Math.sqrt(n.grau) * (n.tipo === 'documento' ? 0.6 : 1.1)));
const hub = (n: No) => n.tipo === 'nucleo' || n.tipo === 'conector' || n.tipo === 'estante';
const fmtData = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

function Deslizante({ id, rotulo, valor, min, max, passo, aoMudar }: { id: string; rotulo: string; valor: number; min: number; max: number; passo: number; aoMudar: (n: number) => void }) {
  return <div className="flex items-center gap-2 text-xs text-slate-700"><label htmlFor={id} className="w-28 shrink-0">{rotulo}</label>
    <input id={id} type="range" min={min} max={max} step={passo} value={valor} onChange={e => aoMudar(Number(e.target.value))} className="w-full accent-violet-500" /></div>;
}
function Secao({ titulo, children, aberta = false }: { titulo: string; children: React.ReactNode; aberta?: boolean }) {
  return <details open={aberta} className="group border-t border-slate-200 py-2"><summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-600">{titulo}</summary><div className="mt-2 space-y-2">{children}</div></details>;
}

export function GrafoCerebro() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('rede');
  const [rede, setRede] = useState<Grafo>();
  const [erro, setErro] = useState('');
  const [ocultos, setOcultos] = useState<Set<TipoDeNo>>(new Set());
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<NoSim>();
  const [local, setLocal] = useState<{ id: string; profundidade: number }>();
  const [ajustes, setAjustes] = useState<Ajustes>(PADRAO);
  const [painel, setPainel] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulacao = useRef<Simulation<NoSim, LigSim>>(undefined);
  const estado = useRef({
    vista: { k: 1, x: 0, y: 0 }, alvo: { k: 1, x: 0, y: 0 }, sobre: undefined as NoSim | undefined, esmaecer: 0,
    nos: [] as NoSim[], ligacoes: [] as LigSim[], vizinhos: new Map<string, Set<string>>(), destaque: new Set<string>(),
    ajustes: PADRAO, selecionado: undefined as NoSim | undefined, revelados: Infinity, grande: false, arrastando: false, quadro: 0, modo: 'rede' as Modo, reduzir: false,
  });
  const acordar = useRef<() => void>(() => {});
  const memoria = useRef(new Map<string, NoSim>());

  useEffect(() => {
    const controle = new AbortController();
    fetch('/api/cerebro/grafo', { signal: controle.signal }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setRede(j as Grafo); })
      .catch(e => { if (e.name !== 'AbortError') setErro('O grafo do cérebro ainda não está disponível. Ele é gerado ao fim de cada coleta (npm run grafo:gerar).'); });
    estado.current.reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => controle.abort();
  }, []);

  const arquitetura = useMemo(() => grafoDaArquitetura(), []);
  const dados: { nos: No[]; arestas: Aresta[] } | undefined = modo === 'arquitetura' ? arquitetura : rede;

  // Adjacência completa (para o grafo local e a lista de vizinhos).
  const adjacencia = useMemo(() => {
    const m = new Map<string, Set<string>>(); if (!dados) return m;
    for (const a of dados.arestas) { (m.get(a.de) ?? m.set(a.de, new Set()).get(a.de)!).add(a.para); (m.get(a.para) ?? m.set(a.para, new Set()).get(a.para)!).add(a.de); }
    return m;
  }, [dados]);

  // Conjunto visível: filtros por tipo, órfãos e, no grafo local, a vizinhança até a profundidade escolhida (como o "Local graph" do Obsidian).
  const visivel = useMemo(() => {
    if (!dados) return undefined;
    let ids = new Set(dados.nos.filter(n => !ocultos.has(n.tipo) && (ajustes.orfaos || n.grau > 0)).map(n => n.id));
    if (local && ids.has(local.id)) {
      const alcance = new Set([local.id]); let fronteira = [local.id];
      for (let d = 0; d < local.profundidade; d++) { const proxima: string[] = []; for (const id of fronteira) for (const v of adjacencia.get(id) ?? []) if (ids.has(v) && !alcance.has(v)) { alcance.add(v); proxima.push(v); } fronteira = proxima; }
      ids = alcance;
    }
    return { ids, arestas: dados.arestas.filter(a => ids.has(a.de) && ids.has(a.para)) };
  }, [dados, ocultos, ajustes.orfaos, local, adjacencia]);

  const achados = useMemo(() => {
    const termo = semAcento(busca.trim()); if (termo.length < 2 || !dados || !visivel) return [];
    return dados.nos.filter(n => visivel.ids.has(n.id) && semAcento(n.rotulo).includes(termo)).sort((a, b) => b.grau - a.grau).slice(0, 12);
  }, [busca, dados, visivel]);

  // Simulação: refeita quando muda o conjunto visível; os nós guardam a posição entre filtros (o grafo não "pula").
  useEffect(() => {
    if (!dados || !visivel) return;
    const e = estado.current; e.modo = modo;
    const ordemPorData = [...dados.nos].sort((a, b) => (hub(b) ? 1 : 0) - (hub(a) ? 1 : 0) || (a.data ?? '0').localeCompare(b.data ?? '0'));
    const posicaoNaOrdem = new Map(ordemPorData.map((n, i) => [n.id, i]));
    const nos = dados.nos.filter(n => visivel.ids.has(n.id)).map(n => {
      const chave = `${modo}:${n.id}`; let s = memoria.current.get(chave);
      if (!s) { s = { ...n, r: raioBase(n), ordem: posicaoNaOrdem.get(n.id) ?? 0 }; if (modo === 'arquitetura') { s.fx = n.x; s.fy = n.y; } memoria.current.set(chave, s); }
      return s;
    });
    const ligacoes: LigSim[] = visivel.arestas.map(a => ({ source: a.de, target: a.para, tipo: a.tipo }));
    const vizinhos = new Map<string, Set<string>>();
    for (const a of visivel.arestas) { (vizinhos.get(a.de) ?? vizinhos.set(a.de, new Set()).get(a.de)!).add(a.para); (vizinhos.get(a.para) ?? vizinhos.set(a.para, new Set()).get(a.para)!).add(a.de); }
    Object.assign(e, { nos, ligacoes, vizinhos });
    simulacao.current?.stop();
    // Grafo grande (milhares de documentos): as posições já vêm prontas do servidor, então a física começa quase assentada e se acomoda depressa;
    // cada passo com 6 mil corpos custa caro no navegador. Grafo local e pequeno animam por mais tempo, como no Obsidian.
    const grande = nos.length > 1500 && !local; e.grande = grande;
    const sim = forceSimulation<NoSim, LigSim>(nos).velocityDecay(grande ? 0.5 : 0.35).alphaDecay(e.reduzir ? 0.2 : grande ? 0.08 : 0.025)
      .force('link', forceLink<NoSim, LigSim>(ligacoes).id(n => n.id))
      .force('carga', forceManyBody<NoSim>().theta(grande ? 1.2 : 0.9).distanceMax(grande ? 450 : 700))
      .force('x', forceX<NoSim>(0)).force('y', forceY<NoSim>(0))
      .on('tick', () => acordar.current());
    simulacao.current = sim; aplicarForcas(sim, e.ajustes);
    sim.alpha(local ? 0.9 : grande ? 0.05 : 0.25).restart();
    acordar.current();
    return () => { sim.stop(); };
  }, [dados, visivel, modo, local]);

  // Forças do painel (mesma ideia dos controles do Obsidian); mexer reaquece a simulação.
  function aplicarForcas(sim: Simulation<NoSim, LigSim>, a: Ajustes) {
    const escala = a.distancia / 250;
    (sim.force('link') as ReturnType<typeof forceLink<NoSim, LigSim>>).distance(l => DISTANCIA[l.tipo] * 220 * escala).strength(l => FORCA[l.tipo] * a.ligacao);
    (sim.force('carga') as ReturnType<typeof forceManyBody<NoSim>>).strength(n => -a.repulsao * 6 * PESO[n.tipo]);
    (sim.force('x') as ReturnType<typeof forceX<NoSim>>).strength(a.centro * 0.035); (sim.force('y') as ReturnType<typeof forceY<NoSim>>).strength(a.centro * 0.035);
  }
  useEffect(() => {
    estado.current.ajustes = ajustes;
    const sim = simulacao.current; if (!sim) return;
    aplicarForcas(sim, ajustes); sim.alpha(Math.max(sim.alpha(), estado.current.grande ? 0.15 : 0.35)).restart(); acordar.current();
  }, [ajustes]);
  useEffect(() => { estado.current.destaque = new Set(achados.map(n => n.id)); acordar.current(); }, [achados]);
  useEffect(() => { estado.current.selecionado = selecionado; acordar.current(); }, [selecionado]);

  const enquadrar = useCallback((imediato = false) => {
    const c = canvas.current; const e = estado.current; if (!c || !e.nos.length) return;
    const xs = e.nos.map(n => n.x ?? 0); const ys = e.nos.map(n => n.y ?? 0);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(c.clientWidth / (x1 - x0 + 160), c.clientHeight / (y1 - y0 + 160), 2.5);
    e.alvo = { k, x: c.clientWidth / 2 - ((x0 + x1) / 2) * k, y: c.clientHeight / 2 - ((y0 + y1) / 2) * k };
    if (imediato) e.vista = { ...e.alvo };
    acordar.current();
  }, []);
  useEffect(() => { const t = setTimeout(() => enquadrar(true), 30); return () => clearTimeout(t); }, [modo, rede, local, enquadrar]);

  // Desenho contínuo enquanto houver movimento (física, zoom suave, esmaecimento, animação); parado, não gasta processador.
  useEffect(() => {
    const c = canvas.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
    const e = estado.current;
    const desenhar = () => {
      e.quadro = 0;
      const dpr = window.devicePixelRatio || 1; const w = c.clientWidth; const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      // Zoom e deslocamento suaves (interpolação até o alvo).
      const suave = e.reduzir ? 1 : 0.22; const v = e.vista; const a = e.alvo;
      v.k += (a.k - v.k) * suave; v.x += (a.x - v.x) * suave; v.y += (a.y - v.y) * suave;
      const foco = e.sobre ?? e.selecionado; const perto = foco ? e.vizinhos.get(foco.id) : undefined;
      e.esmaecer += ((foco ? 1 : 0) - e.esmaecer) * (e.reduzir ? 1 : 0.18);
      if (e.revelados < e.nos.length) e.revelados += Math.max(1, e.nos.length / 260);
      const aj = e.ajustes; const { k, x, y } = v;
      const naTela = (n: NoSim) => { const sx = (n.x ?? 0) * k + x; const sy = (n.y ?? 0) * k + y; return sx > -60 && sx < w + 60 && sy > -60 && sy < h + 60; };
      const revelado = (n: NoSim) => n.ordem < e.revelados;
      const emFoco = (n: NoSim) => !foco || n.id === foco.id || Boolean(perto?.has(n.id));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = FUNDO; ctx.fillRect(0, 0, w, h);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
      // Ligações em dois lotes: as comuns (esmaecidas quando há foco) e as do nó em foco (cor de destaque).
      const largura = (aj.espessura * 0.9) / Math.max(k, 0.4);
      ctx.lineWidth = largura; ctx.strokeStyle = LINHA; ctx.globalAlpha = 1 - 0.75 * e.esmaecer; ctx.beginPath();
      const doFoco: LigSim[] = [];
      for (const l of e.ligacoes) {
        const s = l.source as NoSim; const t = l.target as NoSim; if (!revelado(s) || !revelado(t)) continue;
        if (foco && (s.id === foco.id || t.id === foco.id)) { doFoco.push(l); continue; }
        ctx.moveTo(s.x ?? 0, s.y ?? 0); ctx.lineTo(t.x ?? 0, t.y ?? 0);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (doFoco.length) { ctx.strokeStyle = ACENTO; ctx.lineWidth = largura * 1.8; ctx.beginPath(); for (const l of doFoco) { const s = l.source as NoSim; const t = l.target as NoSim; ctx.moveTo(s.x ?? 0, s.y ?? 0); ctx.lineTo(t.x ?? 0, t.y ?? 0); } ctx.stroke(); }
      // Setas (no fim de cada ligação), como a opção "Arrows" do Obsidian.
      if (aj.setas) {
        ctx.fillStyle = foco ? ACENTO : 'rgba(150,150,150,0.6)';
        for (const l of foco ? doFoco : e.ligacoes.length < 4000 ? e.ligacoes : []) {
          const s = l.source as NoSim; const t = l.target as NoSim; if (!revelado(s) || !revelado(t)) continue;
          const ang = Math.atan2((t.y ?? 0) - (s.y ?? 0), (t.x ?? 0) - (s.x ?? 0)); const rr = t.r * aj.tamanho + 1.5; const tam = 4 / Math.max(k, 0.5);
          const px = (t.x ?? 0) - Math.cos(ang) * rr; const py = (t.y ?? 0) - Math.sin(ang) * rr;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(ang - 0.45) * tam, py - Math.sin(ang - 0.45) * tam); ctx.lineTo(px - Math.cos(ang + 0.45) * tam, py - Math.sin(ang + 0.45) * tam); ctx.fill();
        }
      }
      // Nós em lote: um traçado por cor e por estado (ativo/esmaecido), em vez de um preenchimento por nó — com milhares de nós, é o que mantém a fluidez.
      const lotes = new Map<string, { cor: string; alfa: number; nos: { x: number; y: number; r: number }[] }>();
      const especiais: NoSim[] = [];
      const alfaApagado = 1 - 0.85 * e.esmaecer;
      for (const n of e.nos) {
        if (!revelado(n) || !naTela(n)) continue;
        if ((foco && n.id === foco.id) || e.destaque.has(n.id)) { especiais.push(n); continue; }
        const cor = aj.cores ? LEGENDA[n.tipo].cor : NO_NEUTRO; const alfa = emFoco(n) ? 1 : alfaApagado; const chave = `${cor}|${alfa}`;
        (lotes.get(chave) ?? lotes.set(chave, { cor, alfa, nos: [] }).get(chave)!).nos.push({ x: n.x ?? 0, y: n.y ?? 0, r: n.r * aj.tamanho });
      }
      for (const lote of lotes.values()) {
        ctx.globalAlpha = lote.alfa; ctx.fillStyle = lote.cor; ctx.beginPath();
        for (const p of lote.nos) { ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const n of especiais) {
        const r = n.r * aj.tamanho * (e.destaque.has(n.id) ? 1.6 : 1) * (foco && n.id === foco.id ? 1.25 : 1);
        if (foco && n.id === foco.id) { ctx.fillStyle = 'rgba(168,130,255,0.25)'; ctx.beginPath(); ctx.arc(n.x ?? 0, n.y ?? 0, r * 2.2, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = foco && n.id === foco.id ? ACENTO : aj.cores ? LEGENDA[n.tipo].cor : NO_NEUTRO;
        ctx.beginPath(); ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2); ctx.fill();
        if (e.destaque.has(n.id)) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 / k; ctx.stroke(); }
      }
      // Rótulos: aparecem gradualmente conforme o zoom ("Text fade threshold"); os do nó em foco e dos vizinhos aparecem sempre.
      const limiar = 1.1 * Math.pow(2, aj.limiarTexto);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = TEXTO;
      // A fonte só muda entre os dois estilos (trocar `ctx.font` a cada rótulo é caro).
      const fonteHub = `600 ${13 / k}px ui-sans-serif, system-ui, sans-serif`; const fonteComum = `${11 / k}px ui-sans-serif, system-ui, sans-serif`;
      let fonteAtual = '';
      for (const n of e.nos) {
        const forcado = (foco && emFoco(n)) || e.destaque.has(n.id) || e.modo === 'arquitetura';
        const base = hub(n) ? limiar * 0.22 : n.tipo === 'documento' ? limiar * 1.6 : limiar * 0.75;
        // Teste barato primeiro: sem zoom suficiente e sem foco, o rótulo nem é considerado.
        if (!forcado && k <= base) continue;
        if (!revelado(n) || !naTela(n)) continue;
        let alfa = forcado ? 1 : Math.min(1, Math.max(0, (k - base) / (base * 0.6)));
        if (foco && !emFoco(n)) alfa *= 1 - 0.9 * e.esmaecer;
        if (alfa < 0.03) continue;
        const fonte = hub(n) ? fonteHub : fonteComum; if (fonte !== fonteAtual) { ctx.font = fonte; fonteAtual = fonte; }
        ctx.globalAlpha = alfa;
        const texto = n.rotulo.length > 52 ? `${n.rotulo.slice(0, 50)}…` : n.rotulo;
        ctx.fillText(texto, n.x ?? 0, (n.y ?? 0) + n.r * aj.tamanho + 3 / k);
      }
      ctx.globalAlpha = 1;
      const movendo = Math.abs(a.k - v.k) > 1e-3 * a.k || Math.abs(a.x - v.x) > 0.3 || Math.abs(a.y - v.y) > 0.3;
      const esmaecendo = Math.abs((foco ? 1 : 0) - e.esmaecer) > 0.01;
      if (movendo || esmaecendo || e.revelados < e.nos.length || e.arrastando) e.quadro = requestAnimationFrame(desenhar);
    };
    acordar.current = () => { if (!e.quadro) e.quadro = requestAnimationFrame(desenhar); };
    acordar.current();
    const redimensionar = new ResizeObserver(() => acordar.current()); redimensionar.observe(c);
    return () => { cancelAnimationFrame(e.quadro); e.quadro = 0; redimensionar.disconnect(); };
  }, []);

  // Interação: arrastar nó (a física puxa os vizinhos), arrastar o fundo (move a vista), roda (zoom em volta do cursor), clique e duplo clique.
  useEffect(() => {
    const c = canvas.current; if (!c) return; const e = estado.current;
    const mundo = (px: number, py: number) => [(px - e.vista.x) / e.vista.k, (py - e.vista.y) / e.vista.k] as const;
    const noEm = (px: number, py: number) => {
      const [gx, gy] = mundo(px, py); let melhor: NoSim | undefined; let dist = Infinity;
      for (const n of e.nos) { if (n.ordem >= e.revelados) continue; const d = ((n.x ?? 0) - gx) ** 2 + ((n.y ?? 0) - gy) ** 2; const alcance = (n.r * e.ajustes.tamanho + 5 / e.vista.k) ** 2; if (d < alcance && d < dist) { melhor = n; dist = d; } }
      return melhor;
    };
    const ponto = (ev: PointerEvent | WheelEvent | MouseEvent) => { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top] as const; };
    let gesto: { tipo: 'no'; no: NoSim; moveu: boolean } | { tipo: 'fundo'; x: number; y: number; vx: number; vy: number; moveu: boolean } | undefined;
    const baixo = (ev: PointerEvent) => {
      const [px, py] = ponto(ev); const n = noEm(px, py); c.setPointerCapture(ev.pointerId);
      if (n) { gesto = { tipo: 'no', no: n, moveu: false }; n.fx = n.x; n.fy = n.y; e.arrastando = true; simulacao.current?.alphaTarget(e.grande ? 0.08 : 0.25).restart(); }
      else gesto = { tipo: 'fundo', x: px, y: py, vx: e.alvo.x, vy: e.alvo.y, moveu: false };
    };
    const mover = (ev: PointerEvent) => {
      const [px, py] = ponto(ev);
      if (gesto?.tipo === 'no') { const [gx, gy] = mundo(px, py); gesto.no.fx = gx; gesto.no.fy = gy; gesto.moveu = true; acordar.current(); return; }
      if (gesto?.tipo === 'fundo') { const dx = px - gesto.x; const dy = py - gesto.y; if (Math.abs(dx) + Math.abs(dy) > 3) gesto.moveu = true; e.alvo = { ...e.alvo, x: gesto.vx + dx, y: gesto.vy + dy }; e.vista = { ...e.vista, x: e.alvo.x, y: e.alvo.y }; acordar.current(); return; }
      const n = noEm(px, py); if (n !== e.sobre) { e.sobre = n; c.classList.toggle('cursor-pointer', Boolean(n)); acordar.current(); }
    };
    const cima = (ev: PointerEvent) => {
      const [px, py] = ponto(ev);
      if (gesto?.tipo === 'no') { const n = gesto.no; if (e.modo !== 'arquitetura') { n.fx = null; n.fy = null; } e.arrastando = false; simulacao.current?.alphaTarget(0); if (!gesto.moveu) setSelecionado(n); }
      else if (gesto?.tipo === 'fundo' && !gesto.moveu) setSelecionado(noEm(px, py));
      gesto = undefined; acordar.current();
    };
    const sair = () => { if (e.sobre) { e.sobre = undefined; acordar.current(); } };
    const roda = (ev: WheelEvent) => {
      ev.preventDefault(); const [px, py] = ponto(ev); const { k, x, y } = e.alvo;
      const novo = Math.min(12, Math.max(0.03, k * Math.exp(-ev.deltaY * 0.0018)));
      e.alvo = { k: novo, x: px - ((px - x) * novo) / k, y: py - ((py - y) * novo) / k }; acordar.current();
    };
    const duplo = (ev: MouseEvent) => { const [px, py] = ponto(ev); const n = noEm(px, py); if (n?.href) router.push(n.href); };
    c.addEventListener('pointerdown', baixo); c.addEventListener('pointermove', mover); c.addEventListener('pointerup', cima); c.addEventListener('pointerleave', sair);
    c.addEventListener('wheel', roda, { passive: false }); c.addEventListener('dblclick', duplo);
    return () => { c.removeEventListener('pointerdown', baixo); c.removeEventListener('pointermove', mover); c.removeEventListener('pointerup', cima); c.removeEventListener('pointerleave', sair); c.removeEventListener('wheel', roda); c.removeEventListener('dblclick', duplo); };
  }, [router]);

  const centrarEm = (id: string) => {
    const c = canvas.current; const e = estado.current; const n = e.nos.find(x => x.id === id); if (!c || !n) return;
    const k = Math.max(e.alvo.k, 1.4); e.alvo = { k, x: c.clientWidth / 2 - (n.x ?? 0) * k, y: c.clientHeight / 2 - (n.y ?? 0) * k }; setSelecionado(n); acordar.current();
  };
  const animar = () => { estado.current.revelados = 0; acordar.current(); };
  const trocarModo = (m: Modo) => { setModo(m); setSelecionado(undefined); setLocal(undefined); };
  const muda = <K extends keyof Ajustes>(chave: K) => (valor: Ajustes[K]) => setAjustes(a => ({ ...a, [chave]: valor }));
  const alternar = (t: TipoDeNo) => setOcultos(o => { const n = new Set(o); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const vizinhosDoSelecionado = selecionado && dados ? [...(adjacencia.get(selecionado.id) ?? [])].map(id => dados.nos.find(n => n.id === id)!).filter(Boolean).sort((a, b) => b.grau - a.grau).slice(0, 15) : [];
  const tiposPresentes = TIPOS.filter(t => dados?.nos.some(n => n.tipo === t));
  const totais = rede ? `${rede.nos.length.toLocaleString('pt-BR')} nós · ${rede.arestas.length.toLocaleString('pt-BR')} ligações · gerado em ${fmtData(rede.geradoEm)}` : '';
  const botao = (ativo: boolean) => `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${ativo ? 'border-violet-400 bg-violet-50 font-medium text-slate-900' : 'border-slate-200 text-slate-700'}`;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Modo de visualização">
      <button type="button" onClick={() => trocarModo('rede')} aria-pressed={modo === 'rede'} className={botao(modo === 'rede')}><Network size={16} aria-hidden />Rede de conhecimento</button>
      <button type="button" onClick={() => trocarModo('arquitetura')} aria-pressed={modo === 'arquitetura'} className={botao(modo === 'arquitetura')}><Workflow size={16} aria-hidden />Arquitetura do sistema</button>
      {modo === 'rede' && totais && <span className="text-xs text-slate-600">{totais}</span>}
    </div>
    {modo === 'rede' && erro && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">{erro}</p>}
    <div className={`grid gap-4 ${painel ? 'lg:grid-cols-[1fr_19rem]' : ''}`}>
      <div className="relative overflow-hidden rounded-2xl border border-neutral-700 bg-[#1e1e1e]">
        <canvas ref={canvas} className="block h-[74vh] min-h-[440px] w-full touch-none" role="img"
          aria-label={modo === 'arquitetura' ? 'Diagrama do caminho de uma pergunta pela SINDI, da guarda à resposta verificada.' : `Rede do cérebro da SINDI: ${totais}. O painel ao lado permite buscar, filtrar e abrir cada item.`} />
        <div className="absolute right-3 top-3 flex gap-2">
          {local && <button type="button" onClick={() => setLocal(undefined)} className="rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-800">Voltar ao grafo inteiro</button>}
          <button type="button" onClick={() => enquadrar()} aria-label="Enquadrar o grafo" className="rounded-lg border border-neutral-600 bg-neutral-900 p-1.5 text-neutral-100 hover:bg-neutral-800"><Crosshair size={16} /></button>
          <button type="button" onClick={() => setPainel(p => !p)} aria-label={painel ? 'Esconder ajustes' : 'Mostrar ajustes'} aria-pressed={painel} className="rounded-lg border border-neutral-600 bg-neutral-900 p-1.5 text-neutral-100 hover:bg-neutral-800"><Settings2 size={16} /></button>
        </div>
        <p className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-neutral-300">Arraste os pontos · role para aproximar · clique para ver as ligações · duplo clique abre</p>
      </div>
      {painel && <aside className="space-y-1 rounded-2xl border border-slate-200 bg-surface p-4" aria-label="Ajustes do grafo">
        {selecionado && <section className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3" aria-live="polite">
          <div className="flex items-start justify-between gap-2"><h2 className="text-sm font-semibold text-slate-900">{selecionado.rotulo}</h2>
            <button type="button" onClick={() => setSelecionado(undefined)} aria-label="Fechar detalhes" className="text-slate-500 hover:text-slate-900"><X size={16} /></button></div>
          <p className="mt-1 text-xs text-slate-600">{LEGENDA[selecionado.tipo].nome}{selecionado.data ? ` · ${fmtData(selecionado.data)}` : ''} · {selecionado.grau} ligações</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {selecionado.href && <Link href={selecionado.href} className="font-medium text-slate-900 underline decoration-violet-400 decoration-2 underline-offset-4">Abrir</Link>}
            {modo === 'rede' && <button type="button" onClick={() => setLocal({ id: selecionado.id, profundidade: local?.profundidade ?? 1 })} className="font-medium text-slate-900 underline decoration-violet-400 decoration-2 underline-offset-4">Grafo local</button>}
          </div>
          {local && <div className="mt-2"><Deslizante id="profundidade" rotulo={`Profundidade: ${local.profundidade}`} valor={local.profundidade} min={1} max={4} passo={1} aoMudar={p => setLocal({ ...local, profundidade: p })} /></div>}
          {vizinhosDoSelecionado.length > 0 && <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">{vizinhosDoSelecionado.map(v => <li key={v.id}><button type="button" onClick={() => centrarEm(v.id)} className="w-full truncate text-left text-slate-700 hover:text-slate-950">↳ {v.rotulo}</button></li>)}</ul>}
        </section>}
        <div className="pb-2"><label htmlFor="busca-grafo" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600"><Search size={14} aria-hidden />Buscar</label>
          <input id="busca-grafo" type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Ex.: 13.429, NR-1, convenção" className="w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 focus-visible:border-violet-400 focus-visible:outline-none" />
          {achados.length > 0 && <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-sm">{achados.map(n => <li key={n.id}><button type="button" onClick={() => centrarEm(n.id)} className="w-full truncate rounded px-2 py-1 text-left text-slate-800 hover:bg-violet-50">{n.rotulo}</button></li>)}</ul>}
        </div>
        {modo === 'arquitetura'
          ? <p className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">O caminho de cada pergunta: a guarda barra abuso e remove dados pessoais; o orquestrador escolhe o especialista da área (e um de apoio, se a pergunta cair entre duas);
            as fontes vêm do cérebro, da biblioteca, do grafo e das ferramentas; uma única redação passa pela cascata de provedores até um responder; o verificador confere cada número, lei e contato nas fontes. Arraste os blocos para reorganizar.</p>
          : <>
            <Secao titulo="Filtros" aberta>
              <ul className="space-y-1 text-sm">{tiposPresentes.map(t => <li key={t}><label className="flex items-center gap-2 text-slate-800">
                <input type="checkbox" checked={!ocultos.has(t)} onChange={() => alternar(t)} className="size-4 accent-violet-500" />
                <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="5" fill={LEGENDA[t].cor} /></svg>{LEGENDA[t].nome}
                <span className="ml-auto tabular-nums text-xs text-slate-600">{dados?.nos.filter(n => n.tipo === t).length.toLocaleString('pt-BR')}</span></label></li>)}</ul>
              <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={ajustes.orfaos} onChange={e => muda('orfaos')(e.target.checked)} className="size-4 accent-violet-500" />Mostrar órfãos (sem ligações)</label>
            </Secao>
            <Secao titulo="Grupos"><label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={ajustes.cores} onChange={e => muda('cores')(e.target.checked)} className="size-4 accent-violet-500" />Colorir por tipo (como os grupos do Obsidian)</label></Secao>
            <Secao titulo="Exibição">
              <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={ajustes.setas} onChange={e => muda('setas')(e.target.checked)} className="size-4 accent-violet-500" />Setas</label>
              <Deslizante id="limiar" rotulo="Limiar do texto" valor={ajustes.limiarTexto} min={-3} max={3} passo={0.1} aoMudar={muda('limiarTexto')} />
              <Deslizante id="tamanho" rotulo="Tamanho dos nós" valor={ajustes.tamanho} min={0.3} max={3} passo={0.05} aoMudar={muda('tamanho')} />
              <Deslizante id="espessura" rotulo="Espessura das ligações" valor={ajustes.espessura} min={0.2} max={4} passo={0.05} aoMudar={muda('espessura')} />
              <button type="button" onClick={animar} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"><Play size={13} aria-hidden />Animar (linha do tempo)</button>
            </Secao>
            <Secao titulo="Forças">
              <Deslizante id="centro" rotulo="Força de centro" valor={ajustes.centro} min={0} max={1} passo={0.01} aoMudar={muda('centro')} />
              <Deslizante id="repulsao" rotulo="Força de repulsão" valor={ajustes.repulsao} min={0} max={20} passo={0.1} aoMudar={muda('repulsao')} />
              <Deslizante id="ligacao" rotulo="Força de ligação" valor={ajustes.ligacao} min={0} max={1} passo={0.01} aoMudar={muda('ligacao')} />
              <Deslizante id="distancia" rotulo="Distância das ligações" valor={ajustes.distancia} min={30} max={500} passo={1} aoMudar={muda('distancia')} />
            </Secao>
            <button type="button" onClick={() => setAjustes(PADRAO)} className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"><RotateCcw size={13} aria-hidden />Restaurar padrão</button>
          </>}
      </aside>}
    </div>
  </div>;
}
