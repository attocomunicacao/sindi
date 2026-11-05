import { OrcamentoForm } from '@/components/orcamento-form';

export const metadata = { title: 'Orçamento de terceirização | SINDI' };
export default function OrcamentoPage() {
  return <><main className="anim-rise mx-auto max-w-6xl space-y-10 gutter py-12 text-slate-700">
    <header><span className="block h-1 w-10 rounded-full bg-amber-400" aria-hidden />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">Orçamento de terceirização</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Monte os postos de trabalho e veja o custo mensal estimado, com encargos, benefícios, tributos e margem.</p></header>
    <OrcamentoForm />
  </main></>;
}
