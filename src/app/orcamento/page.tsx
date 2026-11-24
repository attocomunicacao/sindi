import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { FormularioOrcamento } from '@/componentes/orcamento/formulario-orcamento';

export const metadata = { title: 'Orçamento de terceirização | SINDI' };

export default function OrcamentoPage() {
  return (
    <PaginaFerramenta
      largura="max-w-6xl"
      espaco="space-y-10"
      titulo="Orçamento de terceirização"
      descricao="Monte os postos de trabalho e veja o custo mensal estimado, com encargos, benefícios, tributos e margem."
    >
      <FormularioOrcamento />
    </PaginaFerramenta>
  );
}
