import { numeroBR } from '@/lib/base/formato';
import type { DiaDeUso } from '@/lib/infra/uso';
import { diaEMes } from '@/componentes/uso/calculos-de-uso';

export type MetricaDoGrafico = 'totalTokens' | 'requests';

const compacto = (n: number) => n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: n < 10000 ? 1 : 0 });
// Faixa do topo para os valores e do rodapé para as datas, em % da altura do gráfico.
const TOPO = 14;
const BASE = 86;
const ALTURA = BASE - TOPO;

/**
 * Colunas por dia, desenhadas com atributos SVG (e não `style`) para respeitar a política de segurança de conteúdo, como os gráficos do painel.
 * Posições em % da área do gráfico: o SVG acompanha qualquer largura sem distorcer o texto. Até 7 dias, todo dia tem valor e data;
 * em 30 dias, só o maior valor e o de hoje são escritos e as datas aparecem a cada 5 dias. O dia de hoje (ainda em andamento) fica em destaque.
 */
export function GraficoDiario({ dias, metrica }: { dias: DiaDeUso[]; metrica: MetricaDoGrafico }) {
  const quantidade = dias.length;
  if (!quantidade) return null;
  const maximo = Math.max(1, ...dias.map(d => d[metrica]));
  const indiceDoMaximo = dias.findIndex(d => d[metrica] === maximo);
  const passo = 100 / quantidade;
  const largura = passo * (quantidade > 10 ? 0.7 : 0.6);
  return <svg className="h-56 w-full overflow-visible text-[11px] sm:text-xs" aria-hidden>
    <line x1="0" x2="100%" y1={`${BASE}%`} y2={`${BASE}%`} className="stroke-slate-300" strokeWidth="1" />
    {dias.map((dia, i) => {
      const valor = dia[metrica];
      const altura = valor ? Math.max(valor / maximo * ALTURA, 1.5) : 0;
      const centro = passo * i + passo / 2;
      const x = centro - largura / 2;
      const hoje = i === quantidade - 1;
      const comValor = quantidade <= 10 || hoje || i === indiceDoMaximo;
      const comData = quantidade <= 10 || i % 5 === 0 || hoje;
      return <g key={dia.date}>
        <title>{`${diaEMes(dia.date)}: ${numeroBR(valor)}`}</title>
        {/* O segundo retângulo cobre o arredondamento de baixo (só o topo é arredondado); a opacidade fica no grupo para a sobreposição não escurecer. */}
        {altura > 0 && <g className="fill-amber-400" opacity={hoje ? 1 : 0.6}>
          <rect x={`${x}%`} y={`${BASE - altura}%`} width={`${largura}%`} height={`${altura}%`} rx="3" />
          <rect x={`${x}%`} y={`${BASE - altura / 2}%`} width={`${largura}%`} height={`${altura / 2}%`} />
        </g>}
        {comValor && <text x={`${centro}%`} y={`${BASE - altura - 3}%`} textAnchor="middle" className={`fill-slate-700 tabular-nums ${hoje ? 'font-semibold' : ''}`}>{compacto(valor)}</text>}
        {comData && <text x={`${centro}%`} y="97%" textAnchor="middle" className={`tabular-nums ${hoje ? 'fill-slate-900 font-semibold' : 'fill-slate-500'}`}>{hoje ? 'hoje' : diaEMes(dia.date)}</text>}
      </g>;
    })}
  </svg>;
}
