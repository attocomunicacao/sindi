import { ArrowDownRight, ArrowUpRight, Download, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Dashboard, Kpi, Par, Serie } from '@/lib/dados/dashboard';

const dataHora = (v: string | null) => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
const tom = (favoravel: boolean | null) => favoravel === null ? 'bg-slate-100 text-slate-600' : favoravel ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/15 text-red-700 dark:text-red-300';

function Variacao({ delta, sentido, favoravel, rotulo = 'em relação ao período anterior' }: { delta: string | null; sentido: Kpi['sentido']; favoravel: boolean | null; rotulo?: string }) {
  if (!delta) return null;
  const Icone = sentido === 'alta' ? ArrowUpRight : sentido === 'queda' ? ArrowDownRight : Minus;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tom(favoravel)}`}><Icone size={12} aria-hidden />{delta}<span className="sr-only"> {rotulo}</span></span>;
}

/** Cartão de destaque: valor atual em corpo grande, variação e período de referência. */
function CartaoKpi({ k }: { k: Kpi }) {
  return <article className="rounded-2xl border border-slate-200 bg-surface p-5">
    <p className="text-xs font-medium tracking-wide text-slate-500">{k.rotulo.toUpperCase()}</p>
    <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{k.valor}</p>
    <p className="mt-0.5 text-xs text-slate-500">{k.unidade}</p>
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1"><Variacao delta={k.delta} sentido={k.sentido} favoravel={k.favoravel} />{k.anterior && <span className="text-xs text-slate-500">anterior {k.anterior}</span>}</div>
    <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">Referência: {k.periodo}</p>
  </article>;
}

/**
 * Colunas por mês, com o zero marcado: positivas em dourado, negativas em vermelho, o último mês em destaque. Cada gráfico tem a própria escala,
 * porque o Brasil (centenas de milhares) esconderia o trabalho temporário (milhares) numa escala comum. Os valores ficam escritos sobre as colunas.
 */
function Colunas({ serie }: { serie: Serie }) {
  const L = 260; const topo = 24; const alto = 86; const base = topo + alto;
  const valores = serie.pontos.map(p => p.valor); const lo = Math.min(0, ...valores); const hi = Math.max(0, ...valores); const faixa = hi - lo || 1;
  const y = (v: number) => topo + (hi - v) / faixa * alto;
  const n = serie.pontos.length; const largura = Math.min(46, (L - 24) / n - 12); const passo = (L - 24) / n;
  const ultimo = serie.pontos[n - 1]; const anterior = serie.pontos[n - 2];
  return <figure className="rounded-2xl border border-slate-200 bg-surface p-5">
    <figcaption>
      <p className="text-sm font-semibold text-slate-900">{serie.rotulo}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500"><span className="text-2xl font-semibold tabular-nums text-slate-900">{ultimo.valor.toLocaleString('pt-BR')}</span> vagas em {ultimo.rotulo}
        {anterior && <span>· {ultimo.valor >= anterior.valor ? 'acima' : 'abaixo'} de {anterior.rotulo} ({anterior.valor.toLocaleString('pt-BR')})</span>}</p>
    </figcaption>
    <svg viewBox={`0 0 ${L} ${base + 38}`} role="img" aria-label={`${serie.rotulo}: ${serie.pontos.map(p => `${p.rotulo} ${p.valor.toLocaleString('pt-BR')} vagas`).join('; ')}`} className="mt-3 w-full">
      <line x1="6" x2={L - 6} y1={y(0)} y2={y(0)} className="stroke-slate-300" strokeWidth="1" />
      {serie.pontos.map((p, i) => {
        const cx = 12 + passo * i + passo / 2; const topoBarra = y(Math.max(p.valor, 0)); const fundoBarra = y(Math.min(p.valor, 0)); const altura = Math.max(fundoBarra - topoBarra, 1.5); const atual = i === n - 1;
        return <g key={p.periodo}>
          <rect x={cx - largura / 2} y={topoBarra} width={largura} height={altura} rx="3" className={p.valor < 0 ? 'fill-brand-red' : 'fill-amber-400'} opacity={atual ? 1 : 0.55} />
          <text x={cx} y={p.valor < 0 ? fundoBarra + 12 : topoBarra - 5} textAnchor="middle" className={`fill-slate-700 text-[11px] ${atual ? 'font-semibold' : ''}`}>{p.texto}</text>
          <text x={cx} y={base + 32} textAnchor="middle" className="fill-slate-500 text-[11px]">{p.rotulo}</text>
        </g>;
      })}
    </svg>
    <div className="sr-only"><table><caption>{serie.rotulo}, saldo de vagas por mês</caption><tbody>{serie.pontos.map(p => <tr key={p.periodo}><th scope="row">{p.rotulo}</th><td>{p.valor.toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div>
  </figure>;
}

/** Taxas: valor atual em destaque e duas barras (anterior e atual) na mesma escala do cartão. */
function CartaoTaxa({ p }: { p: Par }) {
  const lo = Math.min(0, p.atual, p.anterior ?? 0); const hi = Math.max(0, p.atual, p.anterior ?? 0); const faixa = hi - lo || 1;
  // SVG com atributos (e não `style`) para respeitar a política de segurança de conteúdo da página.
  const barra = (v: number, classe: string) => <svg className="h-3 w-full" aria-hidden><rect width="100%" height="12" rx="6" className="fill-slate-100" /><rect x={`${(Math.min(0, v) - lo) / faixa * 100}%`} width={`${Math.max(Math.abs(v) / faixa * 100, v === 0 ? 0 : 1.5)}%`} height="12" rx="6" className={classe} /></svg>;
  return <article className="rounded-2xl border border-slate-200 bg-surface p-5">
    <div className="flex items-start justify-between gap-3"><h4 className="text-sm font-semibold text-slate-900">{p.rotulo}</h4><Variacao delta={p.delta} sentido={p.sentido} favoravel={p.favoravel} /></div>
    <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
      {barra(p.atual, 'fill-amber-400')}<span className="text-right text-lg font-semibold tabular-nums text-slate-900">{p.atualTexto}</span>
      {p.anterior !== null && <>{barra(p.anterior, 'fill-slate-300')}<span className="text-right text-xs tabular-nums text-slate-500">{p.anteriorTexto}</span></>}
    </div>
    <p className="mt-3 text-xs text-slate-500">Dourado: referência {p.periodo}{p.anterior !== null ? '. Cinza: período anterior.' : '.'} <a href={p.url} target="_blank" rel="noreferrer" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900">{p.fonte}</a></p>
  </article>;
}

/**
 * Indicadores do painel, do mais importante ao detalhe: destaques, evolução do emprego formal, taxas e valores derivados. Substitui a grade de cartões
 * e o dashboard separado que repetiam os mesmos números; o PDF (A4) reúne exatamente estes blocos.
 */
export function PainelIndicadores({ dados }: { dados: Dashboard }) {
  return <section aria-labelledby="indicadores">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h2 id="indicadores" className="text-xl font-semibold text-slate-900">Indicadores</h2><p className="mt-1 text-sm text-slate-500">Referências: {dados.periodos}. Atualizado em {dataHora(dados.atualizadoEm)}.</p></div>
      <Button asChild variant="outline"><a href="/api/painel/pdf" download="painel-sindi.pdf"><Download size={16} aria-hidden />Gerar PDF</a></Button>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{dados.kpis.map(k => <CartaoKpi key={k.id} k={k} />)}</div>

    {dados.series.length > 0 && <div className="mt-10">
      <h3 className="text-base font-semibold text-slate-900">Emprego formal: saldo de vagas por mês</h3>
      <p className="mt-1 text-sm text-slate-500">Admissões menos desligamentos (Novo CAGED). Dourado: saldo positivo; vermelho: saldo negativo; a última coluna é o mês mais recente. Cada gráfico tem a sua escala.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{dados.series.map(s => <Colunas key={s.id} serie={s} />)}</div>
    </div>}

    {dados.taxas.length > 0 && <div className="mt-10">
      <h3 className="text-base font-semibold text-slate-900">Juros, preços e atividade</h3>
      <p className="mt-1 text-sm text-slate-500">Cada cartão compara o período mais recente com o anterior. Verde e vermelho indicam variação favorável ou desfavorável ao emprego e ao crédito; cinza, sem julgamento.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{dados.taxas.map(p => <CartaoTaxa key={p.rotulo} p={p} />)}</div>
    </div>}

    {dados.derivados.length > 0 && <div className="mt-10 grid gap-4 sm:grid-cols-3">{dados.derivados.map(d => <div key={d.rotulo} className="rounded-2xl border border-slate-200 bg-surface p-5">
      <p className="text-xs font-medium text-slate-500">{d.rotulo}</p><p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">{d.valor}</p><p className="mt-1 text-xs text-slate-500">{d.nota}</p></div>)}</div>}
    <p className="mt-6 text-xs leading-5 text-slate-500">Dados públicos do Banco Central, do IBGE e do Ministério do Trabalho (Novo CAGED), coletados pela SINDI. Indicadores como IPCA e PNAD são divulgados uma vez por mês, então só o último período e o anterior são mostrados; a evolução mensal existe hoje apenas para o emprego formal. Valores derivados são cálculos simples sobre esses dados.</p>
  </section>;
}
