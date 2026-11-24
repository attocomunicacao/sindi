import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { linkSeguro } from '@/lib/base/url-segura';
import type { Item, Parte } from '@/lib/biblioteca/consulta';
import { Etiqueta } from '@/componentes/biblioteca/etiqueta';
import { data } from '@/componentes/biblioteca/formatacao';
import { Pendente } from '@/componentes/layout/pendente';

const CLASSE_DO_TEXTO = 'mt-2 line-clamp-3 text-sm leading-6 text-slate-600';

/** Trecho com as palavras buscadas marcadas, ou o resumo do item quando não há busca. */
function Trecho({ trecho, resumo }: { trecho?: Parte[]; resumo: string }) {
  if (trecho?.length) {
    return (
      <p className={CLASSE_DO_TEXTO}>
        {trecho.map((p, i) =>
          p.destaque ? (
            <mark key={i} className="bg-amber-200 px-0.5 text-slate-900">
              {p.texto}
            </mark>
          ) : (
            <span key={i}>{p.texto}</span>
          ),
        )}
      </p>
    );
  }
  return resumo ? <p className={CLASSE_DO_TEXTO}>{resumo}</p> : null;
}

/** Item de lista da biblioteca: etiquetas, título, origem e datas, trecho e os links para ler e para a fonte oficial. */
export function CartaoDoItem({
  item,
  rotuloEstante,
  trecho,
}: {
  item: Item;
  rotuloEstante?: string;
  trecho?: Parte[];
}) {
  const enderecoDoDocumento = `/base/documento/${item.id}?r=${item.ref}`;
  return (
    <li className="group py-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {rotuloEstante && <Etiqueta tom="destaque">{rotuloEstante}</Etiqueta>}
        {item.etiquetas.map((e) => (
          <Etiqueta key={e}>{e}</Etiqueta>
        ))}
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug text-slate-900">
        <Link
          href={enderecoDoDocumento}
          className="hover:underline focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          {item.titulo}
          <Pendente />
        </Link>
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {item.origem}
        {item.publicado ? ` · publicado em ${data(item.publicado)}` : ''} · coletado em {data(item.coletado)}
      </p>
      <Trecho trecho={trecho} resumo={item.resumo} />
      <div className="mt-3 flex flex-wrap gap-5 text-sm">
        <Link
          href={enderecoDoDocumento}
          className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4 hover:decoration-slate-900"
        >
          Ler
          <Pendente />
        </Link>
        <a
          href={linkSeguro(item.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900"
        >
          Fonte oficial <ArrowUpRight size={14} aria-hidden />
        </a>
      </div>
    </li>
  );
}
