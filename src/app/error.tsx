'use client';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Erro inesperado numa página: fica dentro do layout (cabeçalho e faixa continuam). A página padrão do Next usa atributos style, que a CSP bloqueia.
 * Nada é registrado aqui (sem logs de conteúdo). O código mostrado é o digest do Next: um hash que localiza o erro no log do servidor, sem detalhes internos.
 */
export default function ErroDaPagina({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main role="alert" className="anim-rise mx-auto max-w-6xl gutter py-12 sm:py-16">
    <span className="block h-1 w-10 rounded-full bg-brand-red" aria-hidden />
    <p className="mt-5 text-sm text-slate-500">Erro inesperado</p>
    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Algo deu errado nesta página</h1>
    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Pode ser uma falha temporária. Tente de novo; se continuar, volte ao início e tente mais tarde.</p>
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
      <Button type="button" onClick={() => retry()}><RotateCcw size={16} aria-hidden />Tentar de novo</Button>
      <Link href="/" className="text-sm font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4 hover:decoration-slate-900">Voltar ao início</Link>
    </div>
    {error.digest && <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">Código do erro: <code className="tabular-nums">{error.digest}</code></p>}
  </main>;
}
