'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, PanelLeft, RotateCcw, X } from 'lucide-react';
import { MarcaSindi } from '@/componentes/layout/marca-sindi';
import { paginaDe, paginasDoMenu, type Pagina } from '@/lib/paginas';
import { AlternarTema } from '@/componentes/layout/alternar-tema';
import { Pendente } from '@/componentes/layout/pendente';
import { Configuracao } from '@/componentes/layout/configuracao';
import { ABRIR_CONVERSAS, NOVA_CONVERSA } from '@/componentes/chat/nova-conversa';
import { useTeclaEsc } from '@/componentes/ui/usar-tecla-esc';

// Links e página atual vêm do registro de páginas (src/lib/paginas.ts).
const LINKS = paginasDoMenu();
const CLASSE_DO_ICONE =
  'flex size-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400 pointer-coarse:size-11';

function MenuEmLinha({ pagina }: { pagina: Pagina }) {
  return (
    <nav aria-label="Principal" className="hidden flex-1 items-center justify-center gap-0.5 md:flex">
      {LINKS.map(({ rota, id, rotulo }) => {
        const ativo = pagina === id;
        return (
          <Link
            key={rota}
            href={rota}
            aria-current={ativo ? 'page' : undefined}
            className={`relative whitespace-nowrap rounded-full px-3 py-2 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400 lg:px-3 ${ativo ? 'font-medium text-slate-900 after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-amber-400' : 'text-slate-500'}`}
          >
            {rotulo}
            <Pendente />
          </Link>
        );
      })}
    </nav>
  );
}

/** Menu dos celulares: abre sob o cabeçalho, com uma área de toque fora dele que o fecha. */
function MenuSuspenso({ pagina, aoFechar }: { pagina: Pagina; aoFechar: () => void }) {
  return (
    <>
      {/* Toque fora do menu fecha. O backdrop-blur do cabeçalho prende elementos "fixed" a ele, por isso a área de fora é calculada a partir do próprio cabeçalho. */}
      <div aria-hidden className="absolute inset-x-0 top-full h-dvh bg-slate-900/20 md:hidden" onClick={aoFechar} />
      <nav
        id="menu-principal"
        aria-label="Principal"
        className="anim-fade absolute inset-x-0 top-full max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] overflow-y-auto bg-canvas pb-[env(safe-area-inset-bottom)] shadow-flutuante md:hidden"
      >
        <ul className="gutter mx-auto max-w-[120rem] divide-y divide-slate-200 py-4">
          {LINKS.map(({ rota, id, rotulo }) => {
            const ativo = pagina === id;
            return (
              <li key={rota}>
                <Link
                  href={rota}
                  aria-current={ativo ? 'page' : undefined}
                  onClick={aoFechar}
                  className={`flex min-h-14 items-center gap-3 text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-amber-400 ${ativo ? 'font-medium text-slate-900' : 'text-slate-600'}`}
                >
                  <span aria-hidden className={`h-5 w-1 rounded-full ${ativo ? 'bg-amber-400' : 'bg-transparent'}`} />
                  {rotulo}
                  <Pendente />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/**
 * Cabeçalho único, no layout raiz: permanece montado entre páginas, e por isso a marca consegue trocar de glifo em vez de reiniciar.
 * A partir de md (768 px) os links ficam em linha; abaixo disso (celulares em pé e deitados) vão para um menu que abre sob o cabeçalho.
 * Em janelas baixas (celular deitado) o cabeçalho deixa de ser fixo para não ocupar a tela.
 */
export function CabecalhoDoSite() {
  const caminho = usePathname();
  const pagina = paginaDe(caminho);
  // O menu guarda a página em que foi aberto: ao navegar, ele fecha sozinho.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;
  const fechar = () => setAbertoEm(null);
  useTeclaEsc(aberto, fechar);
  return (
    <header className="no-print sticky top-0 z-20 vidro border-b border-slate-200/70 pt-[env(safe-area-inset-top)] baixo:static">
      <div className="gutter mx-auto flex h-14 max-w-[120rem] items-center justify-between gap-3">
        <Link
          href="/"
          aria-label="SINDI, início"
          className="flex shrink-0 items-center focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <MarcaSindi pagina={pagina} tamanho={40} />
          <Pendente />
        </Link>
        <MenuEmLinha pagina={pagina} />
        <div className="flex items-center gap-0.5 text-sm">
          {caminho === '/' && (
            <button
              type="button"
              aria-label="Conversas anteriores"
              title="Conversas anteriores"
              onClick={() => window.dispatchEvent(new Event(ABRIR_CONVERSAS))}
              className={`${CLASSE_DO_ICONE} lg:hidden`}
            >
              <PanelLeft size={16} />
            </button>
          )}
          {caminho === '/' && (
            <button
              type="button"
              aria-label="Nova conversa"
              title="Nova conversa"
              onClick={() => window.dispatchEvent(new Event(NOVA_CONVERSA))}
              className={CLASSE_DO_ICONE}
            >
              <RotateCcw size={16} />
            </button>
          )}
          <Configuracao className={CLASSE_DO_ICONE} />
          <AlternarTema className={CLASSE_DO_ICONE} />
          <button
            type="button"
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={aberto}
            aria-controls="menu-principal"
            onClick={() => setAbertoEm(aberto ? null : caminho)}
            className={`${CLASSE_DO_ICONE} md:hidden`}
          >
            {aberto ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {aberto && <MenuSuspenso pagina={pagina} aoFechar={fechar} />}
    </header>
  );
}
