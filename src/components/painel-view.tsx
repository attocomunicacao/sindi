'use client';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { isPercent } from '@/lib/dados/format';
import { montarDashboard } from '@/lib/dados/dashboard';
import { PainelIndicadores } from '@/components/painel-indicadores';
import type { Painel, PainelIndicator } from '@/lib/dados/painel';

const SOURCE_NAMES: Record<string, string> = { bcb: 'Banco Central', ibge: 'IBGE', camara: 'Câmara', senado: 'Senado', tst: 'TST', wec: 'WEC', sindeprestem: 'SINDEPRESTEM', mte: 'Ministério do Trabalho', caged: 'Novo CAGED', constituicao: 'Constituição', regimentos: 'Regimentos' };
const number = (value: number, unit = '%') => value.toLocaleString('pt-BR', isPercent(unit) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
/** Faixa compacta: percentuais com duas casas, contagens abreviadas (165,8 mil). */
const short = (item: PainelIndicator) => isPercent(item.unit) ? `${number(item.value)}%` : item.value.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';

export function usePainel(refreshMs = 5 * 60 * 1000) {
  const [data, setData] = useState<Painel | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => { try { const response = await fetch('/api/painel', { cache: 'no-store' }); if (response.ok && active) setData(await response.json()); } catch { /* mantém o último painel */ } };
    void load(); const timer = setInterval(load, refreshMs);
    return () => { active = false; clearInterval(timer); };
  }, [refreshMs]);
  return data;
}
const stripLabel = (item: PainelIndicator) => item.id.startsWith('caged') ? `CAGED ${item.label.split('—')[1]?.trim().split(' (')[0] ?? ''}`.trim() : `${item.label.split(' (')[0].split(' — ')[0]}${item.id.endsWith('12m') ? ' 12m' : ''}`;
/** Variação curta ao lado do valor ("0,25 p.p."); a frase completa fica para leitores de tela. */
function Variacao({ item }: { item: PainelIndicator }) {
  if (item.previous === null) return null;
  const delta = item.value - item.previous;
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  const curto = delta === 0 ? 'estável' : `${number(Math.abs(delta), item.unit)}${isPercent(item.unit) ? ' p.p.' : ''}`;
  const frase = delta === 0 ? 'estável' : `${delta > 0 ? 'alta' : 'queda'} de ${curto}`;
  return <span className="inline-flex items-center gap-1 text-sm text-slate-600"><Icon size={14} aria-hidden />{curto}<span className="sr-only"> ({frase} em relação ao período anterior)</span></span>;
}
/** Indicadores principais numa linha compacta no topo do chat: legível (14 e 16 px), mas sem disputar o foco com a SINDI. */
const NA_FAIXA = ['bcb.selic-meta', 'ibge.ipca-12m', 'ibge.desocupacao', 'caged.saldo'];
const ROTULO_NA_FAIXA: Record<string, string> = { 'bcb.selic-meta': 'Selic', 'ibge.ipca-12m': 'IPCA 12m', 'ibge.desocupacao': 'Desocupação', 'caged.saldo': 'CAGED Brasil' };
export function IndicatorStrip() {
  const data = usePainel();
  const itens = NA_FAIXA.flatMap(id => data?.indicators.find(i => i.id === id) ?? []);
  // Sempre presente e com altura fixa (uma linha), para o conteúdo não pular quando os dados chegam; em telas estreitas a linha rola na horizontal em vez de quebrar.
  return <section aria-label="Indicadores econômicos" className="no-print h-12 border-b border-slate-200 bg-surface/70">
    <div className="gutter relative mx-auto flex h-full max-w-6xl items-center gap-x-6 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {itens.map(item => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-baseline gap-2 whitespace-nowrap rounded py-1 hover:underline focus-visible:outline-2 focus-visible:outline-amber-400" title={`${item.label} — ${item.period}. Fonte: ${SOURCE_NAMES[item.source] ?? item.source}`}>
        <span className="text-sm text-slate-600">{ROTULO_NA_FAIXA[item.id] ?? stripLabel(item)}</span>
        <strong className="text-base font-semibold tabular-nums text-slate-900">{short(item)}</strong>
        <Variacao item={item} />
      </a>)}
    </div></section>;
}
export function PainelFull() {
  const data = usePainel(60 * 1000);
  if (!data) return <p className="text-sm text-slate-500">Carregando painel…</p>;
  if (!data.available) return <p>O painel ainda não tem dados. Execute <code>npm run dados:sync</code> neste computador.</p>;
  return <div className="space-y-10">
    <p className="text-sm text-slate-500">Dados públicos de fontes oficiais, coletados a cada 30 minutos neste computador. Última coleta bem-sucedida: {dateTime(data.updatedAt)}. Indicadores como IPCA e PNAD são divulgados mensalmente; a coleta frequente só captura novidades.</p>
    {(() => { const dashboard = montarDashboard(data); return dashboard ? <PainelIndicadores dados={dashboard} /> : null; })()}
    <section aria-labelledby="sindicato"><h2 id="sindicato" className="mb-3 text-lg font-semibold">Notícias do SINDEPRESTEM</h2>
      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-surface">{data.sindicato.noticias.map(item => <li key={item.url} className="p-4"><a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">{item.title}</a>
        <p className="mt-1 text-xs text-slate-500">{date(item.publishedAt)}</p></li>)}</ul>
      {data.sindicato.artigos.length > 0 && <><h3 className="mb-2 mt-5 text-sm font-semibold text-slate-600">Artigos recentes</h3>
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-surface">{data.sindicato.artigos.map(item => <li key={item.url} className="p-4"><a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">{item.title}</a>
          <p className="mt-1 text-xs text-slate-500">{date(item.publishedAt)}</p></li>)}</ul></>}</section>
    <section aria-labelledby="legislativo"><h2 id="legislativo" className="mb-3 text-lg font-semibold">Projetos em pauta no Congresso</h2>
      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-surface">{data.bills.map(bill => <li key={bill.url} className="p-4"><a href={bill.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{bill.title} <span className="font-normal text-slate-500">· {SOURCE_NAMES[bill.source]}</span></a>
        <p className="mt-1 text-sm text-slate-600">{bill.summary}</p><p className="mt-1 text-xs text-slate-500">{bill.situacao ? `${bill.situacao} · ` : ''}Última movimentação: {date(bill.movedAt)}</p></li>)}</ul></section>
    <section aria-labelledby="noticias"><h2 id="noticias" className="mb-3 text-lg font-semibold">Notícias das fontes</h2>
      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-surface">{data.news.map(item => <li key={item.url} className="p-4"><a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">{item.title}</a>
        <p className="mt-1 text-xs text-slate-500">{SOURCE_NAMES[item.source] ?? item.source} · {date(item.publishedAt)}</p></li>)}</ul></section>
    <section aria-labelledby="fontes"><h2 id="fontes" className="mb-3 text-lg font-semibold">Situação das fontes</h2>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">{data.sources.map(s => <li key={s.source} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 rounded-lg bg-slate-100 px-3 py-2"><span>{SOURCE_NAMES[s.source] ?? s.source}</span><span className={`text-right ${s.status === 'ok' ? 'text-slate-600' : 'text-amber-800'}`}>{s.status === 'ok' ? `atualizado ${dateTime(s.lastOk)}` : `falha na última coleta (último sucesso ${dateTime(s.lastOk)})`}</span></li>)}</ul></section>
  </div>;
}
