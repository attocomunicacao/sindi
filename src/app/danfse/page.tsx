import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { SaibaMais } from '@/componentes/ui/saiba-mais';
import { FormularioDanfse } from '@/componentes/danfse/formulario-danfse';

export const metadata = { title: 'Gerar DANFSe | SINDI' };

export default function DanfsePage() {
  return (
    <PaginaFerramenta
      largura="max-w-5xl"
      espaco="space-y-10"
      titulo="Gerar DANFSe"
      descricao="Envie o XML da NFS-e nacional e baixe o DANFSe em PDF, no leiaute do gerador oficial da Receita."
    >
      <FormularioDanfse />
      <SaibaMais titulo="Sobre o gerador">
        <p>
          Adaptação para TypeScript do gerador oficial de DANFSe da Receita Federal do Brasil (licença MIT). Não é um
          produto oficial da Receita; confira o resultado antes de usar como documento fiscal.
        </p>
      </SaibaMais>
    </PaginaFerramenta>
  );
}
