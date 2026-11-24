import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { FormularioDanfse } from '@/componentes/danfse/formulario-danfse';

export const metadata = { title: 'Gerar DANFSe | SINDI' };

export default function DanfsePage() {
  return <PaginaFerramenta largura="max-w-3xl" espaco="space-y-10" titulo="Gerar DANFSe"
    descricao="Envie o XML da NFS-e nacional e baixe o DANFSe (Documento Auxiliar da NFS-e) em PDF, no leiaute do gerador oficial da Receita Federal.">
    <FormularioDanfse />
    <p className="text-xs leading-5 text-slate-500">Adaptação para TypeScript do gerador oficial de DANFSe da Receita Federal do Brasil (licença MIT). Não é um produto oficial da Receita; confira o resultado antes de usar como documento fiscal.</p>
  </PaginaFerramenta>;
}
