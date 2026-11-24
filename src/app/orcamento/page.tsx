import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { FormularioOrcamento } from '@/componentes/orcamento/formulario-orcamento';

export const metadata = { title: 'Orçamento de terceirização | SINDI' };

export default function OrcamentoPage() {
  return (
    <PaginaFerramenta
      largura="max-w-[120rem]"
      espaco="space-y-10"
      titulo="Orçamento de terceirização"
      descricao="Monte os postos e veja o custo com encargos. BDI, lucro e tributos são informados por você."
    >
      <FormularioOrcamento />
    </PaginaFerramenta>
  );
}
