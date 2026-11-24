'use client';
import { Crosshair, Network, Settings2, Workflow } from 'lucide-react';
import { PainelDoGrafo } from '@/componentes/cerebro/painel-do-grafo';
import { useGrafo } from '@/componentes/cerebro/usar-grafo';

const CLASSE_DO_CONTROLE = 'rounded-lg border border-neutral-600 bg-neutral-900 text-neutral-100 hover:bg-neutral-800';
const botaoDeModo = (ativo: boolean) => `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${ativo ? 'border-violet-400 bg-violet-50 font-medium text-slate-900' : 'border-slate-200 text-slate-700'}`;

/** O cérebro da SINDI como grafo interativo (rede de conhecimento ou arquitetura do sistema), com painel de ajustes ao lado. */
export function GrafoCerebro() {
  const { canvas, grafo } = useGrafo();
  const { modo, totais, local, painelAberto } = grafo;
  const descricaoDoCanvas = modo === 'arquitetura'
    ? 'Diagrama do caminho de uma pergunta pela SINDI, da guarda à resposta verificada.'
    : `Rede do cérebro da SINDI: ${totais}. O painel ao lado permite buscar, filtrar e abrir cada item.`;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Modo de visualização">
      <button type="button" onClick={() => grafo.trocarModo('rede')} aria-pressed={modo === 'rede'} className={botaoDeModo(modo === 'rede')}><Network size={16} aria-hidden />Rede de conhecimento</button>
      <button type="button" onClick={() => grafo.trocarModo('arquitetura')} aria-pressed={modo === 'arquitetura'} className={botaoDeModo(modo === 'arquitetura')}><Workflow size={16} aria-hidden />Arquitetura do sistema</button>
      {modo === 'rede' && totais && <span className="text-xs text-slate-600">{totais}</span>}
    </div>
    {modo === 'rede' && grafo.erro && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">{grafo.erro}</p>}
    <div className={`grid gap-4 ${painelAberto ? 'lg:grid-cols-[1fr_19rem]' : ''}`}>
      <div className="relative overflow-hidden rounded-2xl border border-neutral-700 bg-[#1e1e1e]">
        <canvas ref={canvas} className="block h-[74vh] min-h-[440px] w-full touch-none" role="img" aria-label={descricaoDoCanvas} />
        <div className="absolute right-3 top-3 flex gap-2">
          {local && <button type="button" onClick={() => grafo.setLocal(undefined)} className={`${CLASSE_DO_CONTROLE} px-3 py-1.5 text-xs`}>Voltar ao grafo inteiro</button>}
          <button type="button" onClick={() => grafo.enquadrar()} aria-label="Enquadrar o grafo" className={`${CLASSE_DO_CONTROLE} p-1.5`}><Crosshair size={16} /></button>
          <button type="button" onClick={grafo.alternarPainel} aria-label={painelAberto ? 'Esconder ajustes' : 'Mostrar ajustes'} aria-pressed={painelAberto} className={`${CLASSE_DO_CONTROLE} p-1.5`}><Settings2 size={16} /></button>
        </div>
        <p className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-neutral-300">Arraste os pontos · role para aproximar · clique para ver as ligações · duplo clique abre</p>
      </div>
      {painelAberto && <PainelDoGrafo grafo={grafo} />}
    </div>
  </div>;
}
