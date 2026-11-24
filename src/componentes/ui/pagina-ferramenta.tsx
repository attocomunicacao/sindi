import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/base/classes';

/** Filete de destaque no topo dos títulos; âmbar por padrão, vermelho nas telas de erro. */
export function BarraDeDestaque({ cor = 'ambar', className }: { cor?: 'ambar' | 'vermelha'; className?: string }) {
  return (
    <span
      className={cn('block h-1 w-10 rounded-full', cor === 'ambar' ? 'bg-amber-400' : 'bg-brand-red', className)}
      aria-hidden
    />
  );
}

/** <main> de todas as páginas: animação de entrada, centralizado e com as margens laterais do site. `className` define largura máxima, espaçamento e respiro vertical. */
export function Principal({ className, ...props }: ComponentProps<'main'>) {
  return <main className={cn('anim-rise mx-auto gutter', className)} {...props} />;
}

type PropsDaPagina = {
  titulo: string;
  descricao: ReactNode;
  children: ReactNode;
  /** Largura máxima da página (classe do Tailwind), p. ex. "max-w-6xl". */
  largura: string;
  /** Espaço entre os blocos da página, p. ex. "space-y-10". */
  espaco: string;
  /** Respiro acima e abaixo, p. ex. "py-12". */
  respiro?: string;
  /** Largura máxima do parágrafo de apresentação. */
  larguraDaDescricao?: string;
};

/** Página de ferramenta: <main>, cabeçalho (barra âmbar, título e apresentação) e o conteúdo da ferramenta. */
export function PaginaFerramenta({
  titulo,
  descricao,
  children,
  largura,
  espaco,
  respiro = 'py-12',
  larguraDaDescricao = 'max-w-2xl',
}: PropsDaPagina) {
  return (
    <Principal className={cn(largura, espaco, respiro, 'text-slate-700')}>
      <header>
        <BarraDeDestaque />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
        <p className={cn('mt-3 text-base leading-7 text-slate-600', larguraDaDescricao)}>{descricao}</p>
      </header>
      {children}
    </Principal>
  );
}
