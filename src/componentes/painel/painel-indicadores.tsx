import { ArrowDownRight, ArrowUpRight, Download, Minus } from 'lucide-react';
import { linkSeguro } from '@/lib/base/url-segura';
import type { Dashboard, Kpi, Par } from '@/lib/dados/dashboard';
import { Botao } from '@/componentes/ui/botao';
import { Cartao } from '@/componentes/ui/cartao';
import { dataEHora } from '@/componentes/painel/formatacao';
import { GraficoDeColunas } from '@/componentes/painel/grafico-de-colunas';

const tom = (favoravel: boolean | null) =>
  favoravel === null
    ? 'bg-slate-100 text-slate-600'
    : favoravel
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : 'bg-red-500/15 text-red-700 dark:text-red-300';

type PropsDaVariacao = { delta: string | null; sentido: Kpi['sentido']; favoravel: boolean | null; rotulo?: string };

function Variacao({ delta, sentido, favoravel, rotulo = 'em relação ao período anterior' }: PropsDaVariacao) {
  if (!delta) return null;
  const Icone = sentido === 'alta' ? ArrowUpRight : sentido === 'queda' ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tom(favoravel)}`}>
      <Icone size={12} aria-hidden />
      {delta}
      <span className="sr-only"> {rotulo}</span>
    </span>
  );
}

/** Cartão de destaque: valor atual em corpo grande, variação e período de referência. */
function CartaoDeDestaque({ kpi }: { kpi: Kpi }) {
  return (
    <Cartao como="article">
      <p className="text-xs font-medium tracking-wide text-slate-500">{kpi.rotulo.toUpperCase()}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{kpi.valor}</p>
      <p className="mt-0.5 text-xs text-slate-500">{kpi.unidade}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Variacao delta={kpi.delta} sentido={kpi.sentido} favoravel={kpi.favoravel} />
        {kpi.anterior && <span className="text-xs text-slate-500">anterior {kpi.anterior}</span>}
      </div>
      <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">Referência: {kpi.periodo}</p>
    </Cartao>
  );
}

/** Barra horizontal na escala do cartão: SVG com atributos (e não `style`) para respeitar a política de segurança de conteúdo da página. */
function Barra({ valor, minimo, faixa, classe }: { valor: number; minimo: number; faixa: number; classe: string }) {
  return (
    <svg className="h-3 w-full" aria-hidden>
      <rect width="100%" height="12" rx="6" className="fill-slate-100" />
      <rect
        x={`${((Math.min(0, valor) - minimo) / faixa) * 100}%`}
        width={`${Math.max((Math.abs(valor) / faixa) * 100, valor === 0 ? 0 : 1.5)}%`}
        height="12"
        rx="6"
        className={classe}
      />
    </svg>
  );
}

/** Taxas: valor atual em destaque e duas barras (anterior e atual) na mesma escala do cartão. */
function CartaoDeTaxa({ taxa }: { taxa: Par }) {
  const minimo = Math.min(0, taxa.atual, taxa.anterior ?? 0);
  const maximo = Math.max(0, taxa.atual, taxa.anterior ?? 0);
  const faixa = maximo - minimo || 1;
  return (
    <Cartao como="article">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">{taxa.rotulo}</h4>
        <Variacao delta={taxa.delta} sentido={taxa.sentido} favoravel={taxa.favoravel} />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
        <Barra valor={taxa.atual} minimo={minimo} faixa={faixa} classe="fill-amber-400" />
        <span className="text-right text-lg font-semibold tabular-nums text-slate-900">{taxa.atualTexto}</span>
        {taxa.anterior !== null && (
          <>
            <Barra valor={taxa.anterior} minimo={minimo} faixa={faixa} classe="fill-slate-300" />
            <span className="text-right text-xs tabular-nums text-slate-500">{taxa.anteriorTexto}</span>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Dourado: referência {taxa.periodo}
        {taxa.anterior !== null ? '. Cinza: período anterior.' : '.'}{' '}
        <a
          href={linkSeguro(taxa.url)}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
        >
          {taxa.fonte}
        </a>
      </p>
    </Cartao>
  );
}

/**
 * Indicadores do painel, do mais importante ao detalhe: destaques, evolução do emprego formal, taxas e valores derivados. Substitui a grade de cartões
 * e o dashboard separado que repetiam os mesmos números; o PDF (A4) reúne exatamente estes blocos.
 */
export function PainelIndicadores({ dados }: { dados: Dashboard }) {
  return (
    <section aria-labelledby="indicadores">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="indicadores" className="text-xl font-semibold text-slate-900">
            Indicadores
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Referências: {dados.periodos}. Atualizado em {dataEHora(dados.atualizadoEm)}.
          </p>
        </div>
        <Botao comoFilho variante="contorno">
          <a href="/api/painel/pdf" download="painel-sindi.pdf">
            <Download size={16} aria-hidden />
            Gerar PDF
          </a>
        </Botao>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dados.kpis.map((kpi) => (
          <CartaoDeDestaque key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {dados.series.length > 0 && (
        <div className="mt-10">
          <h3 className="text-base font-semibold text-slate-900">Emprego formal: saldo de vagas por mês</h3>
          <p className="mt-1 text-sm text-slate-500">
            Admissões menos desligamentos (Novo CAGED). Dourado: saldo positivo; vermelho: saldo negativo; a última
            coluna é o mês mais recente. Cada gráfico tem a sua escala.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {dados.series.map((s) => (
              <GraficoDeColunas key={s.id} serie={s} />
            ))}
          </div>
        </div>
      )}

      {dados.taxas.length > 0 && (
        <div className="mt-10">
          <h3 className="text-base font-semibold text-slate-900">Juros, preços e atividade</h3>
          <p className="mt-1 text-sm text-slate-500">
            Cada cartão compara o período mais recente com o anterior. Verde e vermelho indicam variação favorável ou
            desfavorável ao emprego e ao crédito; cinza, sem julgamento.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dados.taxas.map((t) => (
              <CartaoDeTaxa key={t.rotulo} taxa={t} />
            ))}
          </div>
        </div>
      )}

      {dados.derivados.length > 0 && (
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {dados.derivados.map((d) => (
            <Cartao key={d.rotulo}>
              <p className="text-xs font-medium text-slate-500">{d.rotulo}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">{d.valor}</p>
              <p className="mt-1 text-xs text-slate-500">{d.nota}</p>
            </Cartao>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs leading-5 text-slate-500">
        Dados públicos do Banco Central, do IBGE e do Ministério do Trabalho (Novo CAGED), coletados pela SINDI.
        Indicadores como IPCA e PNAD são divulgados uma vez por mês, então só o último período e o anterior são
        mostrados; a evolução mensal existe hoje apenas para o emprego formal. Valores derivados são cálculos simples
        sobre esses dados.
      </p>
    </section>
  );
}
