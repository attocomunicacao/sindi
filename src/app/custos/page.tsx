import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { CalculadoraDeCustos } from '@/componentes/custos/calculadora-de-custos';

// Página comercial, para a apresentação ao sindicato: fora do menu e fora de buscadores e prévias de link (registro em src/lib/paginas.ts).
export const metadata = { title: 'Custo com API paga | SINDI', robots: { index: false, follow: false } };

export default function CustosPage() {
  return (
    <PaginaFerramenta
      largura="max-w-[120rem]"
      espaco="space-y-8"
      titulo="Quanto custaria com uma API paga"
      descricao="Estimativa mensal do gasto com a API da Anthropic (Claude Haiku); ajuste os números para simular."
    >
      <CalculadoraDeCustos />
    </PaginaFerramenta>
  );
}
