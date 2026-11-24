import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Pendente } from '@/componentes/layout/pendente';

/** Trilha de navegação ("Biblioteca › Estante › Documento"); o último item é a página atual e não é link. */
export function Migalhas({ itens }: { itens: { rotulo: string; href?: string }[] }) {
  return <nav aria-label="Você está em" className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
    {itens.map((item, i) => <span key={item.rotulo} className="flex items-center gap-1.5">
      {i > 0 && <ChevronRight size={14} aria-hidden className="text-slate-400" />}
      {item.href
        ? <Link href={item.href} className="hover:text-slate-900 hover:underline">{item.rotulo}<Pendente /></Link>
        : <span aria-current="page" className="text-slate-800">{item.rotulo}</span>}
    </span>)}
  </nav>;
}
