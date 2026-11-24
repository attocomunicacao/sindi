import { CustosCalculadora } from '@/components/custos-calculadora';

// Página comercial, para a apresentação ao sindicato: fora do menu e fora de buscadores e prévias de link (registro em src/lib/paginas.ts).
export const metadata = { title: 'Custo com API paga | SINDI', robots: { index: false, follow: false } };
export default function CustosPage() {
  return <><main className="anim-rise mx-auto max-w-6xl space-y-8 gutter py-12 text-slate-700">
    <header><span className="block h-1 w-10 rounded-full bg-amber-400" aria-hidden />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">Quanto custaria com uma API paga</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">Estimativa mensal do gasto com o modelo de IA se a SINDI usar a API da Anthropic (Claude Haiku), para os funcionários do sindicato e, depois, para os associados. Ajuste os números para simular.</p></header>
    <CustosCalculadora />
  </main></>;
}
