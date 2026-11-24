import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { endereco } from '@/componentes/biblioteca/formatacao';
import { Pendente } from '@/componentes/layout/pendente';

const CLASSE_DO_LINK =
  'inline-flex h-9 pointer-coarse:h-11 items-center gap-1 rounded-lg border border-slate-300 bg-surface px-3 text-sm text-slate-700 hover:bg-slate-100';

type PropsDaPaginacao = {
  pagina: number;
  paginas: number;
  base: string;
  parametros: Record<string, string | number | undefined>;
};

/** Navegação "Anterior / Página N de M / Próxima"; some quando há uma página só. */
export function Paginacao({ pagina, paginas, base, parametros }: PropsDaPaginacao) {
  if (paginas <= 1) return null;
  const ir = (destino: number) => endereco(base, { ...parametros, pagina: destino });
  return (
    <nav aria-label="Páginas" className="mt-6 flex items-center justify-between gap-3">
      {pagina > 1 ? (
        <Link href={ir(pagina - 1)} rel="prev" className={CLASSE_DO_LINK}>
          <ChevronLeft size={16} aria-hidden /> Anterior
          <Pendente />
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-slate-500">
        Página {pagina} de {paginas}
      </span>
      {pagina < paginas ? (
        <Link href={ir(pagina + 1)} rel="next" className={CLASSE_DO_LINK}>
          Próxima <ChevronRight size={16} aria-hidden />
          <Pendente />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
