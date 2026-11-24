import Link from 'next/link';
import { Cartao } from '@/componentes/ui/cartao';
import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { CalculadoraDeTributos } from '@/componentes/tributos/calculadora-de-tributos';

export const metadata = { title: 'Calculadora de tributos | SINDI' };

const CLASSE_DO_LINK = 'font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4';

export default function TributosPage() {
  return (
    <PaginaFerramenta
      largura="max-w-5xl"
      espaco="space-y-10"
      titulo="Calculadora de tributos"
      descricao="CBS e IBS da Reforma Tributária para serviços do setor, e o DAS e a CBS/IBS do Simples Nacional, com a memória de cálculo."
    >
      <CalculadoraDeTributos />
      <Cartao como="section" aria-labelledby="mais" className="text-sm leading-6 text-slate-600">
        <h2 id="mais" className="text-base font-semibold text-slate-900">
          Também da Receita Federal
        </h2>
        <p className="mt-1">
          Tem o XML de uma NFS-e?{' '}
          <Link href="/danfse" className={CLASSE_DO_LINK}>
            Gere o DANFSe
          </Link>
          , o documento auxiliar em PDF, com o mesmo layout do gerador oficial. Para levar os tributos ao preço de um
          contrato de terceirização, use o{' '}
          <Link href="/orcamento" className={CLASSE_DO_LINK}>
            orçamento
          </Link>
          .
        </p>
      </Cartao>
    </PaginaFerramenta>
  );
}
