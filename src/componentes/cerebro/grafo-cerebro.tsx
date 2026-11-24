'use client';
import { Crosshair, Network, Settings2, Workflow } from 'lucide-react';
import { PainelDoGrafo } from '@/componentes/cerebro/painel-do-grafo';
import { useGrafo } from '@/componentes/cerebro/usar-grafo';

// Pílulas de vidro sobre o canvas (leem os tokens do site, então acompanham o tema claro e o escuro).
const CLASSE_DO_CONTROLE = 'rounded-full bg-canvas/90 text-slate-800 shadow-suave backdrop-blur hover:bg-surface';
const botaoDeModo = (ativo: boolean) => `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${ativo ? 'bg-primary font-medium text-on-primary' : 'bg-surface text-slate-700 hover:bg-primary/20'}`;

/** O cérebro da SINDI como grafo interativo (rede de conhecimento ou arquitetura do sistema), com painel de ajustes ao lado. */
export function GrafoCerebro() {
  const { canvas, grafo } = useGrafo();
  const { modo, totais, local, painelAberto } = grafo;
  const descricaoDoCanvas = modo === 'arquitetura'
    ? 'Diagrama do caminho de uma pergunta pela SINDI, da guarda à resposta verificada.'
    : `Cérebro da SINDI: a SINDI no centro orquestrando as áreas, cada uma com suas estantes e documentos. ${totais}. O painel ao lado permite buscar, filtrar e abrir cada item.`;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Modo de visualização">
      <button type="button" onClick={() => grafo.trocarModo('rede')} aria-pressed={modo === 'rede'} className={botaoDeModo(modo === 'rede')}><Network size={16} aria-hidden />Rede de conhecimento</button>
      <button type="button" onClick={() => grafo.trocarModo('arquitetura')} aria-pressed={modo === 'arquitetura'} className={botaoDeModo(modo === 'arquitetura')}><Workflow size={16} aria-hidden />Arquitetura do sistema</button>
      {modo === 'rede' && totais && <span className="text-xs text-slate-600">{totais}</span>}
    </div>
    {modo === 'rede' && grafo.usoRecente && (
      <p role="status" className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 text-sm text-slate-800">
        <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
        <span>
          <strong>A última resposta do chat acendeu o cérebro</strong> — {grafo.textoDoUsoRecente}
        </span>
        <button type="button" onClick={grafo.limparUsoRecente} className="text-xs font-medium underline decoration-primary decoration-2 underline-offset-4">
          Limpar
        </button>
      </p>
    )}
    {modo === 'rede' && grafo.erro && <p role="status" className="rounded-2xl bg-surface p-4 text-sm text-slate-800">{grafo.erro}</p>}
    {/* Em lg o painel flutua sobre o canvas, à direita (abaixo dos controles); em celular ele empilha abaixo. */}
    <div className="relative overflow-hidden rounded-3xl bg-canvas shadow-suave">
      <canvas ref={canvas} tabIndex={0} className="block h-[calc(100dvh-9rem)] min-h-[440px] w-full touch-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400" role="img" aria-label={descricaoDoCanvas} aria-describedby="dica-do-cerebro" />
      <div className="absolute right-4 top-3 flex gap-2">
        {local && <button type="button" onClick={() => grafo.setLocal(undefined)} className={`${CLASSE_DO_CONTROLE} px-3 py-1.5 text-xs`}>Voltar ao grafo inteiro</button>}
        <button type="button" onClick={() => grafo.enquadrar()} aria-label="Enquadrar o grafo" className={`${CLASSE_DO_CONTROLE} p-2`}><Crosshair size={16} /></button>
        <button type="button" onClick={grafo.alternarPainel} aria-label={painelAberto ? 'Esconder ajustes' : 'Mostrar ajustes'} aria-pressed={painelAberto} className={`${CLASSE_DO_CONTROLE} p-2 ${painelAberto ? '!bg-primary !text-on-primary' : ''}`}><Settings2 size={16} /></button>
      </div>
      <p id="dica-do-cerebro" className={`pointer-events-none absolute bottom-3 left-4 right-4 text-[11px] text-slate-600 ${painelAberto ? 'lg:right-[21rem]' : ''}`}>Passe o mouse · clique abre · setas navegam</p>
      {painelAberto && <PainelDoGrafo grafo={grafo} />}
    </div>
  </div>;
}
