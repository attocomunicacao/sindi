'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useArmadilhaDeFoco } from '@/componentes/ui/usar-armadilha-de-foco';
import { useTeclaEsc } from '@/componentes/ui/usar-tecla-esc';

/**
 * A barra de conversas no celular e no tablet: uma gaveta à esquerda, como nos chatbots conhecidos. É um diálogo modal de verdade: o foco entra nela e
 * circula só entre os seus itens, Esc ou toque fora fecham, a página atrás não rola e o foco volta ao botão que a abriu.
 */
export function GavetaDeConversas({
  aberta,
  aoFechar,
  children,
}: {
  aberta: boolean;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useTeclaEsc(aberta, aoFechar);
  useArmadilhaDeFoco(aberta, caixa);
  useEffect(() => {
    if (!aberta) return;
    document.documentElement.classList.add('trava-rolagem');
    return () => document.documentElement.classList.remove('trava-rolagem');
  }, [aberta]);
  if (!aberta) return null;
  return (
    <div className="no-print fixed inset-0 z-30 lg:hidden">
      <div className="anim-fade absolute inset-0 bg-black/40" onClick={aoFechar} aria-hidden />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label="Conversas anteriores"
        tabIndex={-1}
        className="anim-rise absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col gap-4 bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Conversas</h2>
          <button
            type="button"
            aria-label="Fechar conversas"
            onClick={aoFechar}
            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400 pointer-coarse:size-11"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
