'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UsageDay } from '@/lib/usage';
type Payload = { days: UsageDay[]; storage: string; available: boolean };
const number = (n: number) => n.toLocaleString('pt-BR');
const compacto = (n: number) => n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: n < 10000 ? 1 : 0 });
const diaMes = (data: string) => data.split('-').reverse().slice(0, 2).join('/');

/**
 * Colunas por dia, desenhadas com atributos SVG (e não `style`) para respeitar a política de segurança de conteúdo, como os gráficos do painel.
 * Posições em % da área do gráfico: o SVG acompanha qualquer largura sem distorcer o texto. Até 7 dias, todo dia tem valor e data;
 * em 30 dias, só o maior valor e o de hoje são escritos e as datas aparecem a cada 5 dias. O dia de hoje (ainda em andamento) fica em destaque.
 */
function GraficoDiario({ days, metric }: { days: UsageDay[]; metric: 'totalTokens' | 'requests' }) {
  const n = days.length; if (!n) return null;
  const max = Math.max(1, ...days.map(d => d[metric])); const indiceMax = days.findIndex(d => d[metric] === max);
  const TOPO = 14; const BASE = 86; const ALTO = BASE - TOPO; // faixa do topo para os valores e do rodapé para as datas
  const passo = 100 / n; const largura = passo * (n > 10 ? 0.7 : 0.6);
  return <svg className="h-56 w-full overflow-visible text-[11px] sm:text-xs" aria-hidden>
    <line x1="0" x2="100%" y1={`${BASE}%`} y2={`${BASE}%`} className="stroke-slate-300" strokeWidth="1" />
    {days.map((d, i) => {
      const v = d[metric]; const h = v ? Math.max(v / max * ALTO, 1.5) : 0; const centro = passo * i + passo / 2; const x = centro - largura / 2;
      const hoje = i === n - 1; const comValor = n <= 10 || hoje || i === indiceMax; const comData = n <= 10 || i % 5 === 0 || hoje;
      return <g key={d.date}><title>{`${diaMes(d.date)}: ${number(v)}`}</title>
        {/* O segundo retângulo cobre o arredondamento de baixo (só o topo é arredondado); a opacidade fica no grupo para a sobreposição não escurecer. */}
        {h > 0 && <g className="fill-amber-400" opacity={hoje ? 1 : 0.6}>
          <rect x={`${x}%`} y={`${BASE - h}%`} width={`${largura}%`} height={`${h}%`} rx="3" />
          <rect x={`${x}%`} y={`${BASE - h / 2}%`} width={`${largura}%`} height={`${h / 2}%`} />
        </g>}
        {comValor && <text x={`${centro}%`} y={`${BASE - h - 3}%`} textAnchor="middle" className={`fill-slate-700 tabular-nums ${hoje ? 'font-semibold' : ''}`}>{compacto(v)}</text>}
        {comData && <text x={`${centro}%`} y="97%" textAnchor="middle" className={`tabular-nums ${hoje ? 'fill-slate-900 font-semibold' : 'fill-slate-500'}`}>{hoje ? 'hoje' : diaMes(d.date)}</text>}
      </g>;
    })}
  </svg>;
}

export default function UsagePage() {
  const [data, setData] = useState<Payload>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(7);
  const [metric, setMetric] = useState<'totalTokens' | 'requests'>('totalTokens');
  async function load() {
    setLoading(true); setError('');
    try { const response = await fetch('/api/usage', { cache: 'no-store' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setData(payload); }
    catch { setError('Não foi possível carregar o uso. Tente atualizar.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/usage', { cache: 'no-store', signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); setData(await response.json()); }).catch(e => { if (e.name !== 'AbortError') setError('Não foi possível carregar o uso. Tente atualizar.'); });
    return () => controller.abort();
  }, []);
  const days = data?.days.slice(-period) || [];
  const totals = days.reduce((sum, d) => ({ requests: sum.requests + d.requests, successes: sum.successes + d.successes, errors: sum.errors + d.errors, inputTokens: sum.inputTokens + d.inputTokens, outputTokens: sum.outputTokens + d.outputTokens, totalTokens: sum.totalTokens + d.totalTokens, measured: sum.measured + d.measured, durationMs: sum.durationMs + d.durationMs }), { requests: 0, successes: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, measured: 0, durationMs: 0 });
  return <><main className="anim-rise mx-auto max-w-6xl gutter py-10">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold text-slate-900">Uso da IA</h1></div><Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Atualizar</Button></div>
    {error && <p className="mt-5 text-sm text-amber-900" role="alert">{error}</p>}
    {data && !data.available && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">O chat está liberado, mas o armazenamento das métricas ainda não foi configurado nesta hospedagem. Os números abaixo não representam consumo registrado.</p>}
    <div className="my-7 flex flex-wrap gap-3"><label className="text-sm">Período <select aria-label="Período" value={period} onChange={e => setPeriod(Number(e.target.value))} className="ml-2 rounded-lg border border-slate-200 bg-surface p-2"><option value={7}>7 dias</option><option value={30}>30 dias</option></select></label><label className="text-sm">Gráfico <select aria-label="Gráfico" value={metric} onChange={e => setMetric(e.target.value as typeof metric)} className="ml-2 rounded-lg border border-slate-200 bg-surface p-2"><option value="totalTokens">Tokens</option><option value="requests">Requisições</option></select></label></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Requisições', totals.requests], ['Tokens de entrada', totals.inputTokens], ['Tokens de saída', totals.outputTokens], ['Tokens totais', totals.totalTokens]].map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-surface p-4 sm:p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-3 text-xl font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl">{data?.available ? number(Number(value)) : '—'}</p></div>)}</div>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-surface p-5 sm:p-7" aria-label="Gráfico de uso diário">
      <h2 className="mb-6 flex items-center gap-2 text-sm font-medium"><BarChart3 size={17} />{metric === 'totalTokens' ? 'Tokens consumidos por dia' : 'Requisições por dia'}</h2>
      <div role="img" aria-label={`Gráfico de ${metric === 'totalTokens' ? 'tokens' : 'requisições'} nos últimos ${period} dias. Valores detalhados na tabela abaixo.`}><GraficoDiario days={days} metric={metric} /></div>
      {data?.available && totals.requests === 0 && <p className="mt-4 text-sm text-slate-500">Nenhuma chamada registrada no período. A coleta começa a partir desta atualização.</p>}
    </section>
    <div className="my-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600"><span>Respostas: {number(totals.successes)}</span><span>Erros: {number(totals.errors)}</span><span>Tempo médio: {totals.requests ? (totals.durationMs / totals.requests / 1000).toFixed(1) : '0'} s</span><span>Chamadas com tokens informados: {number(totals.measured)}</span></div>
    <details className="rounded-xl border border-slate-200 bg-surface p-4"><summary className="cursor-pointer text-sm">Ver dados diários</summary><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Data', 'Chamadas', 'Entrada', 'Saída', 'Total', 'Erros'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{days.map(d => <tr key={d.date} className="border-t border-slate-100"><td className="p-2">{d.date.split('-').reverse().join('/')}</td>{[d.requests, d.inputTokens, d.outputTokens, d.totalTokens, d.errors].map((n, i) => <td key={i} className="p-2">{number(n)}</td>)}</tr>)}</tbody></table></div></details>
    <div className="mt-7 space-y-3 text-xs leading-6 text-slate-500"><p>Entrada inclui sua pergunta, as instruções da SINDI e o contexto da conversa. Saída é a geração do modelo; o total pode incluir tokens de raciocínio, conforme informado pelo modelo. Falhas sem dados de consumo não entram nos totais de tokens.</p><p>Não há limite de mensagens imposto pela SINDI. O Ollama local não tem cota diária de API; a velocidade depende do computador. Este painel mostra apenas chamadas feitas pela SINDI desde o início da coleta; não mostra uso de outras aplicações, saldo de cota nem faturamento. O histórico preserva chamadas Gemini anteriores à migração para Ollama.</p><p>{data?.storage === 'local' ? 'Histórico salvo neste computador. ' : data?.storage === 'shared' ? 'Histórico compartilhado da aplicação. ' : ''}Datas no horário de São Paulo. Somente números agregados são armazenados; nenhuma conversa, IP ou chave aparece neste painel.</p></div>
  </main></>;
}


