import { GrafoCerebro } from '@/components/grafo-cerebro';

export const metadata = { title: 'Cérebro da SINDI | SINDI' };
export default function CerebroPage() {
  return <><main className="anim-rise mx-auto max-w-7xl space-y-6 gutter py-10 text-slate-700">
    <header><span className="block h-1 w-10 rounded-full bg-amber-400" aria-hidden />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">O cérebro da SINDI</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">Tudo o que a SINDI consulta para responder, ligado em rede: os especialistas de cada área, as estantes da biblioteca, o conhecimento
        escrito pela equipe, os documentos coletados e as leis, normas e projetos que os conectam. É esta rede que o chat percorre para achar as fontes de cada resposta.</p></header>
    <GrafoCerebro />
  </main></>;
}
