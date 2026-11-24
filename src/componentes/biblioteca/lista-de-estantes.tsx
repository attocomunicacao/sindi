import Link from 'next/link';
import { numeroBR } from '@/lib/base/formato';
import { ALAS, type Ala } from '@/lib/biblioteca/estantes';
import type { ResumoEstante } from '@/lib/biblioteca/consulta';
import { data } from '@/componentes/biblioteca/formatacao';
import { Pendente } from '@/componentes/layout/pendente';

/** Unidade que acompanha o total de cada estante ("seção", "indicadores", "documento"...). */
function unidadeDoTotal({ estante, total }: ResumoEstante) {
  if (estante.especial === 'cerebro') return total === 1 ? 'seção' : 'seções';
  if (estante.especial === 'indicadores') return 'indicadores';
  return total === 1 ? 'documento' : 'documentos';
}

function LinhaDaEstante({ item, ordem }: { item: ResumoEstante; ordem: number }) {
  const { estante, total, atualizado } = item;
  return (
    <li>
      <Link
        href={`/base/${estante.id}`}
        className="group grid grid-cols-[2rem_1fr] items-baseline gap-x-4 py-4 xs:grid-cols-[2rem_1fr_auto] hover:bg-slate-100/60 focus-visible:outline-2 focus-visible:outline-amber-400 sm:grid-cols-[2.5rem_1fr_auto]"
      >
        <span className="text-sm tabular-nums text-slate-500">{String(ordem).padStart(2, '0')}</span>
        <span className="min-w-0">
          <span className="block text-base font-medium text-slate-900 group-hover:underline group-hover:decoration-amber-400 group-hover:decoration-2 group-hover:underline-offset-4">
            {estante.nome}
          </span>
          <span className="mt-0.5 block text-sm leading-6 text-slate-500">{estante.descricao}</span>
        </span>
        <span className="col-start-2 mt-1 flex items-baseline gap-1.5 text-sm tabular-nums text-slate-500 xs:col-start-auto xs:mt-0 xs:block xs:text-right">
          <span className="block font-semibold text-slate-900">{numeroBR(total)}</span>
          <span className="block text-xs">
            {unidadeDoTotal(item)}
            {atualizado ? ` · ${data(atualizado)}` : ''}
          </span>
        </span>
        <Pendente />
      </Link>
    </li>
  );
}

/** As estantes agrupadas por ala; a numeração continua de uma ala para a outra. */
export function ListaDeEstantes({ estantes }: { estantes: ResumoEstante[] }) {
  let anteriores = 0;
  return (
    <div className="mt-14 space-y-12">
      {(Object.keys(ALAS) as Ala[]).map((ala) => {
        const daAla = estantes.filter((e) => e.estante.ala === ala);
        const primeira = anteriores;
        anteriores += daAla.length;
        return (
          <section key={ala} aria-labelledby={`ala-${ala}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b-2 border-slate-800 pb-2">
              <h2 id={`ala-${ala}`} className="text-lg font-semibold text-slate-900">
                {ALAS[ala].nome}
              </h2>
              <p className="text-sm text-slate-500">{ALAS[ala].descricao}</p>
            </div>
            <ul className="divide-y divide-slate-200">
              {daAla.map((item, i) => (
                <LinhaDaEstante key={item.estante.id} item={item} ordem={primeira + i + 1} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
