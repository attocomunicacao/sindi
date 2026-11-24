'use client';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { ehPercentual, numeroCompacto, numeroDoIndicador } from '@/lib/base/formato';
import { linkSeguro } from '@/lib/base/url-segura';
import type { IndicadorDoPainel } from '@/lib/dados/painel';
import { NOMES_DAS_FONTES } from '@/componentes/painel/formatacao';
import { usePainel } from '@/componentes/painel/usar-painel';

/** Indicadores principais numa linha compacta no topo do chat: legível (14 e 16 px), mas sem disputar o foco com a SINDI. */
const NA_FAIXA = ['bcb.selic-meta', 'ibge.ipca-12m', 'ibge.desocupacao', 'caged.saldo'];
const ROTULO_NA_FAIXA: Record<string, string> = { 'bcb.selic-meta': 'Selic', 'ibge.ipca-12m': 'IPCA 12m', 'ibge.desocupacao': 'Desocupação', 'caged.saldo': 'CAGED Brasil' };

/** Faixa compacta: percentuais com duas casas, contagens abreviadas (165,8 mil). */
const valorCurto = (item: IndicadorDoPainel) => ehPercentual(item.unit) ? `${numeroDoIndicador(item.value, item.unit)}%` : numeroCompacto(item.value);

/** Rótulo curto de um indicador que não tem apelido em ROTULO_NA_FAIXA. */
function rotuloCurto(item: IndicadorDoPainel) {
  if (item.id.startsWith('caged')) return `CAGED ${item.label.split('—')[1]?.trim().split(' (')[0] ?? ''}`.trim();
  return `${item.label.split(' (')[0].split(' — ')[0]}${item.id.endsWith('12m') ? ' 12m' : ''}`;
}

/** Variação curta ao lado do valor ("0,25 p.p."); a frase completa fica para leitores de tela. */
function VariacaoDaFaixa({ item }: { item: IndicadorDoPainel }) {
  if (item.previous === null) return null;
  const delta = item.value - item.previous;
  const Icone = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  const curto = delta === 0 ? 'estável' : `${numeroDoIndicador(Math.abs(delta), item.unit)}${ehPercentual(item.unit) ? ' p.p.' : ''}`;
  const frase = delta === 0 ? 'estável' : `${delta > 0 ? 'alta' : 'queda'} de ${curto}`;
  return <span className="inline-flex items-center gap-1 text-sm text-slate-600"><Icone size={14} aria-hidden />{curto}<span className="sr-only"> ({frase} em relação ao período anterior)</span></span>;
}

export function FaixaDeIndicadores() {
  const { dados } = usePainel();
  const itens = NA_FAIXA.flatMap(id => dados?.indicators.find(i => i.id === id) ?? []);
  // Sempre presente e com altura fixa (uma linha), para o conteúdo não pular quando os dados chegam; em telas estreitas a linha rola na horizontal em vez de quebrar.
  return <section aria-label="Indicadores econômicos" className="no-print h-12 border-b border-slate-200 bg-surface/70">
    <div className="gutter relative mx-auto flex h-full max-w-6xl items-center gap-x-6 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {itens.map(item => <a key={item.id} href={linkSeguro(item.url)} target="_blank" rel="noreferrer" className="flex shrink-0 items-baseline gap-2 whitespace-nowrap rounded py-1 hover:underline focus-visible:outline-2 focus-visible:outline-amber-400" title={`${item.label} — ${item.period}. Fonte: ${NOMES_DAS_FONTES[item.source] ?? item.source}`}>
        <span className="text-sm text-slate-600">{ROTULO_NA_FAIXA[item.id] ?? rotuloCurto(item)}</span>
        <strong className="text-base font-semibold tabular-nums text-slate-900">{valorCurto(item)}</strong>
        <VariacaoDaFaixa item={item} />
      </a>)}
    </div>
  </section>;
}
