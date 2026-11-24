'use client';
import { Carregando } from '@/componentes/ui/aviso';
import { ResumoDoOrcamento } from '@/componentes/orcamento/resumo-do-orcamento';
import { SecaoCliente } from '@/componentes/orcamento/secao-cliente';
import { SecaoInsumos } from '@/componentes/orcamento/secao-insumos';
import { SecaoPostos } from '@/componentes/orcamento/secao-postos';
import { SecaoTributacao } from '@/componentes/orcamento/secao-tributacao';
import { useOrcamento } from '@/componentes/orcamento/usar-orcamento';

/** Formulário do orçamento de terceirização: as quatro seções à esquerda e o resultado ao vivo à direita. */
export function FormularioOrcamento() {
  const orcamento = useOrcamento();
  if (!orcamento.postos.length) return <Carregando>Carregando…</Carregando>;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-12">
        <SecaoCliente
          cliente={orcamento.cliente}
          aoMudarCliente={orcamento.mudarCliente}
          metros={orcamento.metros}
          aoMudarMetros={orcamento.setMetros}
        />
        <SecaoPostos
          postos={orcamento.postos}
          calculo={orcamento.calculo}
          aoAtualizar={orcamento.atualizarPosto}
          aoRemover={orcamento.removerPosto}
          aoAdicionar={orcamento.adicionarPosto}
          aoUsarExemplo={orcamento.usarExemplo}
        />
        <SecaoInsumos insumos={orcamento.insumos} />
        <SecaoTributacao tributos={orcamento.tributos} iss={orcamento.iss} aoMudarIss={orcamento.setIss} />
      </div>
      <ResumoDoOrcamento
        resultado={orcamento.resultado}
        calculo={orcamento.calculo}
        comparacao={orcamento.comparacao}
        repetido={orcamento.repetido}
        erro={orcamento.erro}
        baixando={orcamento.baixando}
        aoBaixar={orcamento.baixar}
      />
    </div>
  );
}
