import type { ReactNode } from 'react';

/** Título numerado de cada seção do formulário ("01 Seus dados"), com filete escuro embaixo. */
export function TituloDaSecao({ id, numero, children }: { id: string; numero: string; children: ReactNode }) {
  return <h2 id={id} className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-slate-800 pb-2 text-lg font-semibold text-slate-900">
    <span className="text-sm font-normal tabular-nums text-slate-500">{numero}</span>{children}
  </h2>;
}

/** Complemento do título, em corpo menor ("(opcional)"). */
export function Opcional({ children }: { children: ReactNode }) {
  return <span className="text-sm font-normal text-slate-500">{children}</span>;
}
