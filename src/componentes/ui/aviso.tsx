import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/base/classes';

/** Aviso em caixa âmbar (falha de atualização, dados defasados). `role` diz ao leitor de tela se interrompe ("alert") ou só informa ("status"). */
export function AvisoEmCaixa({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900', className)}
      {...props}
    />
  );
}

const TAMANHOS = { pequeno: 'text-xs', medio: 'text-sm' } as const;

/** Aviso discreto, com filete âmbar à esquerda (erro de formulário, entrada pendente, cálculo que não pôde ser feito). */
export function AvisoLateral({
  tamanho = 'medio',
  className,
  ...props
}: ComponentProps<'p'> & { tamanho?: keyof typeof TAMANHOS }) {
  return (
    <p className={cn('border-l-2 border-amber-400 pl-3 text-slate-700', TAMANHOS[tamanho], className)} {...props} />
  );
}

/** Estado "carregando" de uma região: o leitor de tela anuncia o texto sem interromper. */
export function Carregando({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-slate-500" role="status">
      {children}
    </p>
  );
}
