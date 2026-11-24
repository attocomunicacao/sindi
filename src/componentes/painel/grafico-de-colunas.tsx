import type { Serie } from '@/lib/dados/dashboard';
import { Cartao } from '@/componentes/ui/cartao';

const LARGURA = 260;
const TOPO = 24;
const ALTURA = 86;
const BASE = TOPO + ALTURA;
const MARGEM_LATERAL = 24;

const emVagas = (v: number) => v.toLocaleString('pt-BR');

function Legenda({ serie }: { serie: Serie }) {
  const ultimo = serie.pontos[serie.pontos.length - 1];
  const anterior = serie.pontos[serie.pontos.length - 2];
  return <figcaption>
    <p className="text-sm font-semibold text-slate-900">{serie.rotulo}</p>
    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
      <span className="text-2xl font-semibold tabular-nums text-slate-900">{emVagas(ultimo.valor)}</span> vagas em {ultimo.rotulo}
      {anterior && <span>· {ultimo.valor >= anterior.valor ? 'acima' : 'abaixo'} de {anterior.rotulo} ({emVagas(anterior.valor)})</span>}
    </p>
  </figcaption>;
}

/**
 * Colunas por mês, com o zero marcado: positivas em dourado, negativas em vermelho, o último mês em destaque. Cada gráfico tem a própria escala,
 * porque o Brasil (centenas de milhares) esconderia o trabalho temporário (milhares) numa escala comum. Os valores ficam escritos sobre as colunas.
 */
export function GraficoDeColunas({ serie }: { serie: Serie }) {
  const valores = serie.pontos.map(p => p.valor);
  const menor = Math.min(0, ...valores);
  const maior = Math.max(0, ...valores);
  const faixa = maior - menor || 1;
  const y = (v: number) => TOPO + (maior - v) / faixa * ALTURA;
  const quantidade = serie.pontos.length;
  const passo = (LARGURA - MARGEM_LATERAL) / quantidade;
  const larguraDaColuna = Math.min(46, passo - 12);
  return <Cartao como="figure">
    <Legenda serie={serie} />
    <svg viewBox={`0 0 ${LARGURA} ${BASE + 38}`} role="img" aria-label={`${serie.rotulo}: ${serie.pontos.map(p => `${p.rotulo} ${emVagas(p.valor)} vagas`).join('; ')}`} className="mt-3 w-full">
      <line x1="6" x2={LARGURA - 6} y1={y(0)} y2={y(0)} className="stroke-slate-300" strokeWidth="1" />
      {serie.pontos.map((p, i) => {
        const centro = 12 + passo * i + passo / 2;
        const topoDaColuna = y(Math.max(p.valor, 0));
        const fundoDaColuna = y(Math.min(p.valor, 0));
        const altura = Math.max(fundoDaColuna - topoDaColuna, 1.5);
        const atual = i === quantidade - 1;
        return <g key={p.periodo}>
          <rect x={centro - larguraDaColuna / 2} y={topoDaColuna} width={larguraDaColuna} height={altura} rx="3" className={p.valor < 0 ? 'fill-brand-red' : 'fill-amber-400'} opacity={atual ? 1 : 0.55} />
          <text x={centro} y={p.valor < 0 ? fundoDaColuna + 12 : topoDaColuna - 5} textAnchor="middle" className={`fill-slate-700 text-[11px] ${atual ? 'font-semibold' : ''}`}>{p.texto}</text>
          <text x={centro} y={BASE + 32} textAnchor="middle" className="fill-slate-500 text-[11px]">{p.rotulo}</text>
        </g>;
      })}
    </svg>
    <div className="sr-only"><table><caption>{serie.rotulo}, saldo de vagas por mês</caption><tbody>{serie.pontos.map(p => <tr key={p.periodo}><th scope="row">{p.rotulo}</th><td>{emVagas(p.valor)}</td></tr>)}</tbody></table></div>
  </Cartao>;
}
