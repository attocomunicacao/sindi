import Link from 'next/link';
import { rotaDe } from '@/lib/paginas';
import { BarraDeDestaque, Principal } from '@/componentes/ui/pagina-ferramenta';

export const metadata = { title: 'Página não encontrada | SINDI' };

const CLASSE_DO_LINK =
  'font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4 hover:decoration-slate-900';

/** 404 próprio: a página padrão do Next é estilizada com atributos style, que a CSP (sem style-src-attr) bloqueia. Vale para endereços inexistentes e para notFound(). */
export default function NaoEncontrada() {
  return (
    <Principal className="max-w-6xl py-12 sm:py-16">
      <BarraDeDestaque />
      <p className="mt-5 text-sm tabular-nums text-slate-500">Erro 404</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Página não encontrada</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
        O endereço pode ter mudado ou o documento não está mais no acervo.
      </p>
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Link href={rotaDe('inicio')} className={CLASSE_DO_LINK}>
          Conversar com a SINDI
        </Link>
        <Link href={rotaDe('base')} className={CLASSE_DO_LINK}>
          Abrir a biblioteca
        </Link>
      </div>
    </Principal>
  );
}
