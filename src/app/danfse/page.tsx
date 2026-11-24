import { DanfseForm } from '@/components/danfse-form';

export const metadata = { title: 'Gerar DANFSe | SINDI' };
export default function DanfsePage() {
  return <><main className="anim-rise mx-auto max-w-3xl space-y-10 gutter py-12 text-slate-700">
    <header><span className="block h-1 w-10 rounded-full bg-amber-400" aria-hidden />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">Gerar DANFSe</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Envie o XML da NFS-e nacional e baixe o DANFSe (Documento Auxiliar da NFS-e) em PDF, no leiaute do gerador oficial da Receita Federal.</p></header>
    <DanfseForm />
    <p className="text-xs leading-5 text-slate-500">Adaptação para TypeScript do gerador oficial de DANFSe da Receita Federal do Brasil (licença MIT). Não é um produto oficial da Receita; confira o resultado antes de usar como documento fiscal.</p>
  </main></>;
}
