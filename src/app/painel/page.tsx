import { PainelFull } from '@/components/painel-view';

export const metadata = { title: 'Painel | SINDI' };
export default function PainelPage() {
  return <><main className="anim-rise mx-auto max-w-6xl space-y-6 gutter py-10 text-slate-700">
    <h1 className="text-2xl font-semibold text-slate-900">Painel do setor</h1>
    <PainelFull />
  </main></>;
}
