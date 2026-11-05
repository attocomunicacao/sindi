import Link from 'next/link';

export const metadata = { title: 'Página não encontrada | SINDI' };
/** 404 próprio: a página padrão do Next é estilizada com atributos style, que a CSP (sem style-src-attr) bloqueia. Vale para endereços inexistentes e para notFound(). */
export default function NaoEncontrada() {
  return <main className="anim-rise mx-auto max-w-6xl gutter py-12 sm:py-16">
    <span className="block h-1 w-10 rounded-full bg-amber-400" aria-hidden />
    <p className="mt-5 text-sm tabular-nums text-slate-500">Erro 404</p>
    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Página não encontrada</h1>
    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">O endereço pode ter mudado ou o documento não está mais no acervo.</p>
    <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
      <Link href="/" className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4 hover:decoration-slate-900">Conversar com a SINDI</Link>
      <Link href="/base" className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4 hover:decoration-slate-900">Abrir a biblioteca</Link>
    </div>
  </main>;
}
