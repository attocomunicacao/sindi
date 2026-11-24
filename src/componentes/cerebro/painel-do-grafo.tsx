import type { ReactNode } from 'react';
import Link from 'next/link';
import { Play, RotateCcw, Search, X } from 'lucide-react';
import { LEGENDA } from '@/lib/grafo/tipos';
import { dataDoGrafo } from '@/componentes/cerebro/layout-do-grafo';
import type { useGrafo } from '@/componentes/cerebro/usar-grafo';

type Grafo = ReturnType<typeof useGrafo>['grafo'];

const CLASSE_DA_CAIXA = 'size-4 accent-violet-500';
const CLASSE_DO_LINK = 'font-medium text-slate-900 underline decoration-violet-400 decoration-2 underline-offset-4';

function Deslizante({ id, rotulo, valor, min, max, passo, aoMudar }: { id: string; rotulo: string; valor: number; min: number; max: number; passo: number; aoMudar: (n: number) => void }) {
  return <div className="flex items-center gap-2 text-xs text-slate-700">
    <label htmlFor={id} className="w-28 shrink-0">{rotulo}</label>
    <input id={id} type="range" min={min} max={max} step={passo} value={valor} onChange={e => aoMudar(Number(e.target.value))} className="w-full accent-violet-500" />
  </div>;
}

function Secao({ titulo, children, aberta = false }: { titulo: string; children: ReactNode; aberta?: boolean }) {
  return <details open={aberta} className="group border-t border-slate-200 py-2">
    <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-600">{titulo}</summary>
    <div className="mt-2 space-y-2">{children}</div>
  </details>;
}

function Marcacao({ marcada, aoMudar, children }: { marcada: boolean; aoMudar: (marcada: boolean) => void; children: ReactNode }) {
  return <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={marcada} onChange={e => aoMudar(e.target.checked)} className={CLASSE_DA_CAIXA} />{children}</label>;
}

/** Detalhes do nó selecionado: tipo, ligações, atalhos para abri-lo ou ver só a vizinhança dele, e a lista dos vizinhos. */
function DetalhesDoNo({ grafo }: { grafo: Grafo }) {
  const { selecionado, local, modo } = grafo;
  if (!selecionado) return null;
  return <section className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3" aria-live="polite">
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-900">{selecionado.rotulo}</h2>
      <button type="button" onClick={() => grafo.setSelecionado(undefined)} aria-label="Fechar detalhes" className="text-slate-500 hover:text-slate-900"><X size={16} /></button>
    </div>
    <p className="mt-1 text-xs text-slate-600">{LEGENDA[selecionado.tipo].nome}{selecionado.data ? ` · ${dataDoGrafo(selecionado.data)}` : ''} · {selecionado.grau} ligações</p>
    <div className="mt-2 flex flex-wrap gap-3 text-sm">
      {selecionado.href && <Link href={selecionado.href} className={CLASSE_DO_LINK}>Abrir</Link>}
      {modo === 'rede' && <button type="button" onClick={() => grafo.setLocal({ id: selecionado.id, profundidade: local?.profundidade ?? 1 })} className={CLASSE_DO_LINK}>Grafo local</button>}
    </div>
    {local && <div className="mt-2"><Deslizante id="profundidade" rotulo={`Profundidade: ${local.profundidade}`} valor={local.profundidade} min={1} max={4} passo={1} aoMudar={p => grafo.setLocal({ ...local, profundidade: p })} /></div>}
    {grafo.vizinhos.length > 0 && <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">{grafo.vizinhos.map(v => <li key={v.id}>
      <button type="button" onClick={() => grafo.centrarEm(v.id)} className="w-full truncate text-left text-slate-700 hover:text-slate-950">↳ {v.rotulo}</button>
    </li>)}</ul>}
  </section>;
}

function Busca({ grafo }: { grafo: Grafo }) {
  return <div className="pb-2">
    <label htmlFor="busca-grafo" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600"><Search size={14} aria-hidden />Buscar</label>
    <input id="busca-grafo" type="search" value={grafo.busca} onChange={e => grafo.setBusca(e.target.value)} placeholder="Ex.: 13.429, NR-1, convenção"
      className="w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 focus-visible:border-violet-400 focus-visible:outline-none" />
    {grafo.achados.length > 0 && <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-sm">{grafo.achados.map(n => <li key={n.id}>
      <button type="button" onClick={() => grafo.centrarEm(n.id)} className="w-full truncate rounded px-2 py-1 text-left text-slate-800 hover:bg-violet-50">{n.rotulo}</button>
    </li>)}</ul>}
  </div>;
}

function AjustesDaRede({ grafo }: { grafo: Grafo }) {
  const { ajustes, mudarAjuste } = grafo;
  return <>
    <Secao titulo="Filtros" aberta>
      <ul className="space-y-1 text-sm">{grafo.tiposPresentes.map(t => <li key={t}><label className="flex items-center gap-2 text-slate-800">
        <input type="checkbox" checked={!grafo.ocultos.has(t)} onChange={() => grafo.alternarTipo(t)} className={CLASSE_DA_CAIXA} />
        <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="5" fill={LEGENDA[t].cor} /></svg>{LEGENDA[t].nome}
        <span className="ml-auto tabular-nums text-xs text-slate-600">{grafo.contagemDoTipo(t)}</span>
      </label></li>)}</ul>
      <Marcacao marcada={ajustes.orfaos} aoMudar={mudarAjuste('orfaos')}>Mostrar órfãos (sem ligações)</Marcacao>
    </Secao>
    <Secao titulo="Grupos"><Marcacao marcada={ajustes.cores} aoMudar={mudarAjuste('cores')}>Colorir por tipo (como os grupos do Obsidian)</Marcacao></Secao>
    <Secao titulo="Exibição">
      <Marcacao marcada={ajustes.setas} aoMudar={mudarAjuste('setas')}>Setas</Marcacao>
      <Deslizante id="limiar" rotulo="Limiar do texto" valor={ajustes.limiarTexto} min={-3} max={3} passo={0.1} aoMudar={mudarAjuste('limiarTexto')} />
      <Deslizante id="tamanho" rotulo="Tamanho dos nós" valor={ajustes.tamanho} min={0.3} max={3} passo={0.05} aoMudar={mudarAjuste('tamanho')} />
      <Deslizante id="espessura" rotulo="Espessura das ligações" valor={ajustes.espessura} min={0.2} max={4} passo={0.05} aoMudar={mudarAjuste('espessura')} />
      <button type="button" onClick={grafo.animar} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"><Play size={13} aria-hidden />Animar (linha do tempo)</button>
    </Secao>
    <Secao titulo="Forças">
      <Deslizante id="centro" rotulo="Força de centro" valor={ajustes.centro} min={0} max={1} passo={0.01} aoMudar={mudarAjuste('centro')} />
      <Deslizante id="repulsao" rotulo="Força de repulsão" valor={ajustes.repulsao} min={0} max={20} passo={0.1} aoMudar={mudarAjuste('repulsao')} />
      <Deslizante id="ligacao" rotulo="Força de ligação" valor={ajustes.ligacao} min={0} max={1} passo={0.01} aoMudar={mudarAjuste('ligacao')} />
      <Deslizante id="distancia" rotulo="Distância das ligações" valor={ajustes.distancia} min={30} max={500} passo={1} aoMudar={mudarAjuste('distancia')} />
    </Secao>
    <button type="button" onClick={grafo.restaurarAjustes} className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"><RotateCcw size={13} aria-hidden />Restaurar padrão</button>
  </>;
}

function ExplicacaoDaArquitetura() {
  return <p className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">O caminho de cada pergunta: a guarda barra abuso e remove dados pessoais; o orquestrador escolhe o especialista da área (e um de apoio, se a pergunta cair entre duas);
    as fontes vêm do cérebro, da biblioteca, do grafo e das ferramentas; uma única redação passa pela cascata de provedores até um responder; o verificador confere cada número, lei e contato nas fontes. Arraste os blocos para reorganizar.</p>;
}

/** Coluna de ajustes ao lado do grafo: detalhes do nó selecionado, busca e, na rede, filtros, grupos, exibição e forças. */
export function PainelDoGrafo({ grafo }: { grafo: Grafo }) {
  return <aside className="space-y-1 rounded-2xl border border-slate-200 bg-surface p-4" aria-label="Ajustes do grafo">
    <DetalhesDoNo grafo={grafo} />
    <Busca grafo={grafo} />
    {grafo.modo === 'arquitetura' ? <ExplicacaoDaArquitetura /> : <AjustesDaRede grafo={grafo} />}
  </aside>;
}
