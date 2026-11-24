import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/base/classes';

const variantesDoBotao = cva(
  'inline-flex items-center justify-center gap-2 rounded-full text-center text-sm leading-5 font-medium transition-colors [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variante: {
        padrao: 'bg-primary text-on-primary hover:bg-primary-hover',
        discreto: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
        contorno: 'border border-slate-300 bg-canvas text-slate-800 hover:bg-slate-100',
      },
      tamanho: { padrao: 'min-h-10 px-5 py-2 pointer-coarse:min-h-11', icone: 'size-9 pointer-coarse:size-11' },
    },
    defaultVariants: { variante: 'padrao', tamanho: 'padrao' },
  },
);

type PropsDoBotao = React.ComponentProps<'button'> & VariantProps<typeof variantesDoBotao> & { comoFilho?: boolean };

/** Botão do site. Com `comoFilho`, aplica o estilo ao elemento filho (um link, por exemplo) em vez de criar um <button>. */
export function Botao({ className, variante, tamanho, comoFilho = false, ...props }: PropsDoBotao) {
  const Elemento = comoFilho ? Slot : 'button';
  return <Elemento className={cn(variantesDoBotao({ variante, tamanho, className }))} {...props} />;
}
