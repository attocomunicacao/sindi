'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, RotateCcw, X } from 'lucide-react';
import { SindiMark, type Pagina } from '@/components/sindi-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { Pendente } from '@/components/pendente';

const links = [['/', 'inicio', 'Início'], ['/painel', 'painel', 'Painel do setor'], ['/orcamento', 'orcamento', 'Orçamento'], ['/base', 'base', 'Biblioteca'], ['/uso', 'uso', 'Uso']] as const;
const paginaDe = (caminho: string): Pagina => (['orcamento', 'painel', 'base', 'uso'] as const).find(p => caminho === `/${p}` || caminho.startsWith(`/${p}/`)) ?? 'inicio';
/** Evento que a página inicial escuta para limpar a conversa. */
export const NOVA_CONVERSA = 'sindi-nova-conversa';
const icone = 'flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400 pointer-coarse:size-11';

/**
 * Cabeçalho único, no layout raiz: permanece montado entre páginas, e por isso a marca consegue trocar de glifo em vez de reiniciar.
 * A partir de md (768 px) os links ficam em linha; abaixo disso (celulares em pé e deitados) vão para um menu que abre sob o cabeçalho.
 * Em janelas baixas (celular deitado) o cabeçalho deixa de ser fixo para não ocupar a tela.
 */
export function SiteHeader() {
  const caminho = usePathname(); const pagina = paginaDe(caminho);
  // O menu guarda a página em que foi aberto: ao navegar, ele fecha sozinho.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbertoEm(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto]);
  return <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur baixo:static">
    <div className="gutter mx-auto flex h-16 max-w-6xl items-center justify-between gap-3">
      <Link href="/" aria-label="SINDI, início" className="flex shrink-0 items-center focus-visible:outline-2 focus-visible:outline-amber-400">
        <SindiMark pagina={pagina} size={44} />
      <Pendente /></Link>
      <div className="flex items-center gap-0.5 text-sm">
        <nav aria-label="Principal" className="hidden items-center gap-0.5 md:flex">
          {links.map(([href, chave, label]) => { const ativo = pagina === chave; return <Link key={href} href={href} aria-current={ativo ? 'page' : undefined} className={`relative whitespace-nowrap rounded-lg px-2.5 py-2 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400 lg:px-3 ${ativo ? 'font-medium text-slate-900 after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:bg-amber-400' : 'text-slate-500'}`}>{label}<Pendente /></Link>; })}
        </nav>
        {caminho === '/' && <button type="button" aria-label="Nova conversa" title="Nova conversa" onClick={() => window.dispatchEvent(new Event(NOVA_CONVERSA))} className={icone}><RotateCcw size={16} /></button>}
        <ThemeToggle className={icone} />
        <button type="button" aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={aberto} aria-controls="menu-principal" onClick={() => setAbertoEm(aberto ? null : caminho)} className={`${icone} md:hidden`}>{aberto ? <X size={18} /> : <Menu size={18} />}</button>
      </div>
    </div>
    {aberto && <>
      {/* Toque fora do menu fecha. O backdrop-blur do cabeçalho prende elementos "fixed" a ele, por isso a área de fora é calculada a partir do próprio cabeçalho. */}
      <div aria-hidden className="absolute inset-x-0 top-full h-dvh bg-slate-900/20 md:hidden" onClick={() => setAbertoEm(null)} />
      <nav id="menu-principal" aria-label="Principal" className="anim-fade absolute inset-x-0 top-full max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto border-b border-slate-200 bg-surface pb-[env(safe-area-inset-bottom)] shadow-sm md:hidden">
        <ul className="gutter mx-auto max-w-6xl divide-y divide-slate-200 py-2">
          {links.map(([href, chave, label]) => { const ativo = pagina === chave; return <li key={href}><Link href={href} aria-current={ativo ? 'page' : undefined} onClick={() => setAbertoEm(null)} className={`flex min-h-12 items-center gap-3 text-base focus-visible:outline-2 focus-visible:outline-amber-400 ${ativo ? 'font-medium text-slate-900' : 'text-slate-600'}`}><span aria-hidden className={`h-5 w-1 rounded-full ${ativo ? 'bg-amber-400' : 'bg-transparent'}`} />{label}<Pendente /></Link></li>; })}
        </ul>
      </nav>
    </>}
  </header>;
}
