import type { ComponentProps, ElementType } from 'react';
import { cn } from '@/lib/base/classes';

/** Superfície arredondada em tom quente sobre o fundo branco, sem borda pesada (estilo Apple); usada por cartões, gráficos e listas. */
export const CLASSE_CARTAO = 'rounded-3xl bg-surface shadow-suave';

/** Cartão com o respiro padrão (p-5); `className` troca o respiro ou acrescenta estilo, e `como` troca o elemento (section, article, figure...). */
export function Cartao({
  como: Elemento = 'div',
  className,
  ...props
}: ComponentProps<'div'> & { como?: ElementType }) {
  return <Elemento className={cn(CLASSE_CARTAO, 'p-5', className)} {...props} />;
}
