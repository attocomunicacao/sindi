import Link from 'next/link';
import { TributosCalculadora } from '@/components/tributos-calculadora';

export const metadata = { title: 'Calculadora de tributos | SINDI' };
export default function TributosPage() {
  return <><main className="anim-rise mx-auto max-w-5xl space-y-10 gutter py-12 text-slate-700">
    <header><span className="block h-1 w-10 rounded-full bg-amber-400" aria-hidden />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">Calculadora de tributos</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">CBS e IBS da Reforma Tributária para serviços do setor, e o DAS e a CBS/IBS do Simples Nacional, com a memória de cálculo.</p></header>
    <TributosCalculadora />
    <section aria-labelledby="mais" className="rounded-2xl border border-slate-200 bg-surface p-5 text-sm leading-6 text-slate-600">
      <h2 id="mais" className="text-base font-semibold text-slate-900">Também da Receita Federal</h2>
      <p className="mt-1">Tem o XML de uma NFS-e? <Link href="/danfse" className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4">Gere o DANFSe</Link>, o documento auxiliar em PDF, com o mesmo layout do gerador oficial. Para levar os tributos ao preço de um contrato de terceirização, use o <Link href="/orcamento" className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4">orçamento</Link>.</p>
    </section>
  </main></>;
}
