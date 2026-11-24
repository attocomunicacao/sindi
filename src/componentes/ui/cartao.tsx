import type { ComponentProps, ElementType } from 'react';
import { cn } from '@/lib/base/classes';

/** Superfície arredondada com borda fina, usada por cartões, gráficos e listas. */
export const CLASSE_CARTAO = 'rounded-2xl border border-slate-200 bg-surface';

/** Cartão com o respiro padrão (p-5); `className` troca o respiro ou acrescenta estilo, e `como` troca o elemento (section, article, figure...). */
export function Cartao({ como: Elemento = 'div', className, ...props }: ComponentProps<'div'> & { como?: ElementType }) {
  return <Elemento className={cn(CLASSE_CARTAO, 'p-5', className)} {...props} />;
}
