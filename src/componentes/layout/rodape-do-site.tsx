import Link from 'next/link';
import { paginasDoMenu } from '@/lib/paginas';
import { AVISOS } from '@/lib/produtos/avisos';

/** Rodapé do site: atalhos das páginas e o aviso de privacidade (em uma linha; a tela de conversa repete o aviso). Sem script, é só HTML. */
export function RodapeDoSite() {
  const links = paginasDoMenu();
  return (
    <footer className="no-print mt-16 bg-faixa pb-[env(safe-area-inset-bottom)] text-sm text-slate-500">
      <div className="gutter mx-auto max-w-[120rem] py-8">
        <nav
          aria-label="Rodapé"
          className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
        >
          {links.map(({ rota, rotulo }) => (
            <Link key={rota} href={rota} className="w-fit hover:text-slate-900 hover:underline underline-offset-4">
              {rotulo}
            </Link>
          ))}
        </nav>
        <hr className="my-5 border-slate-200" />
        <p className="text-xs leading-5">
          {AVISOS.rodape}{' '}
          <Link href="/privacidade" className="underline underline-offset-4 hover:text-slate-900">
            Privacidade
          </Link>
          <span className="ml-2">SINDEPRESTEM</span>
        </p>
      </div>
    </footer>
  );
}
