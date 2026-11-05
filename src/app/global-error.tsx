'use client';
import './globals.css';
import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * Erro no próprio layout raiz: este arquivo substitui o documento inteiro (html e body próprios, sem cabeçalho) e por isso importa o CSS
 * e reaplica o tema escolhido no site. Sem atributos style, por causa da CSP. Sem metadata em componentes de erro: o título vem de <title>.
 */
export default function ErroGeral({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    try {
      const salvo = localStorage.getItem('sindi-theme');
      document.documentElement.dataset.theme = salvo === 'dark' || salvo === 'light' ? salvo : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { /* O tema claro continua legível sem armazenamento do navegador. */ }
  }, []);
  return <html lang="pt-BR" suppressHydrationWarning><body>
    <title>Erro | SINDI</title>
    <main role="alert" className="mx-auto flex min-h-dvh max-w-6xl flex-col justify-center gutter py-12">
      <span className="block h-1 w-10 rounded-full bg-brand-red" aria-hidden />
      <p className="mt-5 text-sm text-slate-500">SINDI · erro inesperado</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">O site não conseguiu carregar</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Pode ser uma falha temporária. Tente de novo; se continuar, recarregue a página mais tarde.</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" onClick={() => retry()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 pointer-coarse:min-h-11"><RotateCcw size={16} aria-hidden />Tentar de novo</button>
        {/* <a> em vez de Link: o roteador pode ser justamente o que falhou; a navegação completa recomeça do zero. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navegação completa intencional, ver acima */}
        <a href="/" className="text-sm font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4 hover:decoration-slate-900">Voltar ao início</a>
      </div>
      {error.digest && <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">Código do erro: <code className="tabular-nums">{error.digest}</code></p>}
    </main>
  </body></html>;
}
