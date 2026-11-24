import { Principal } from '@/componentes/ui/pagina-ferramenta';
import { PainelCompleto } from '@/componentes/painel/painel-completo';

export const metadata = { title: 'Painel | SINDI' };

export default function PainelPage() {
  return (
    <Principal className="max-w-[120rem] space-y-6 py-10 text-slate-700">
      <h1 className="text-2xl font-semibold text-slate-900">Painel do setor</h1>
      <PainelCompleto />
    </Principal>
  );
}
