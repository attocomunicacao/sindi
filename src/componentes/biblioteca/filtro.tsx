import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pendente } from '@/componentes/layout/pendente';

/** Filtro em linha: texto com sublinhado dourado quando ativo, sem botões arredondados. */
export function Filtro({ href, ativo, children }: { href: string; ativo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'true' : undefined}
      className={`border-b-2 pb-0.5 text-sm hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400 ${ativo ? 'border-amber-400 font-medium text-slate-900' : 'border-transparent text-slate-500'}`}
    >
      {children}
      <Pendente />
    </Link>
  );
}
