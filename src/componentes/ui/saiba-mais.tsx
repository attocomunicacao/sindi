import type { ReactNode } from 'react';
import { cn } from '@/lib/base/classes';

/**
 * Texto de apoio recolhido: <details> nativo, sem script. O conteúdo continua no DOM (leitores de tela e busca da página o encontram) e só
 * fica fora da vista até o clique; a página mostra o essencial primeiro e quem quer o detalhe abre. O rótulo é uma pílula discreta.
 */
export function SaibaMais({
  titulo = 'Saiba mais',
  children,
  className,
}: {
  titulo?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn('group', className)}>
      <summary className="inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1.5 rounded-full border border-slate-200 bg-surface px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block text-[0.6rem] transition-transform group-open:rotate-90">
          ▶
        </span>
        {titulo}
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">{children}</div>
    </details>
  );
}
