import type { ReactNode } from 'react';

/** Rótulo curto com filete à esquerda (estante, tipo, categoria); `destaque` usa o filete dourado. */
export function Etiqueta({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'destaque' }) {
  return (
    <span
      className={`inline-flex items-center border-l-2 pl-2 text-xs font-medium uppercase tracking-wider ${tom === 'destaque' ? 'border-amber-400 text-slate-800' : 'border-slate-300 text-slate-500'}`}
    >
      {children}
    </span>
  );
}
