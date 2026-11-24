import { Download, FileText, LoaderCircle } from 'lucide-react';
import { brl } from '@/lib/base/formato';
import type { Resultado } from '@/lib/orcamento/calculo';
import type { ResumoOrcamento } from '@/lib/orcamento/resumo';
import { AvisoLateral } from '@/componentes/ui/aviso';
import { Botao } from '@/componentes/ui/botao';
import { CATALOGO } from '@/componentes/orcamento/catalogo';
import { ResumoDaTributacao } from '@/componentes/orcamento/resumo-da-tributacao';
import type { TipoDoPdf } from '@/componentes/orcamento/usar-orcamento';

const dataDaTabela = CATALOGO.referencia.extraidoEm.split('-').reverse().join('/');
const percentual = (valor: number, total: number) =>
  `${((valor / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function Numeros({ resultado }: { resultado: ResumoOrcamento }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <dt className="text-xs text-slate-500">Em 12 meses</dt>
        <dd className="font-medium">{brl(resultado.valorAnual)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Por funcionário (médio)</dt>
        <dd className="font-medium">{brl(resultado.precoMedioFuncionario)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Funcionários</dt>
        <dd className="font-medium">{resultado.funcionarios}</dd>
      </div>
      {resultado.precoPorMetro !== null && (
        <div>
          <dt className="text-xs text-slate-500">Por m²</dt>
          <dd className="font-medium">{brl(resultado.precoPorMetro)}</dd>
        </div>
      )}
    </dl>
  );
}

function PostosDoResultado({ resultado }: { resultado: ResumoOrcamento }) {
  return (
    <ul className="space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
      {resultado.postos.map((p, i) => (
        <li key={i} className="flex justify-between gap-2">
          <span>
            {p.quantidade}× {p.funcao} ({p.turno})
          </span>
          <span className="font-medium text-slate-800">{brl(p.valorMensal)}</span>
        </li>
      ))}
    </ul>
  );
}

function Composicao({ resultado }: { resultado: ResumoOrcamento }) {
  const { composicao } = resultado;
  const partes: [string, number][] = [
    ['Salários e adicionais', composicao.folha],
    ['Encargos sociais', composicao.encargos],
    ['Benefícios', composicao.beneficios],
    ['PCMSO e PPR', composicao.outros],
    ['Uniformes, EPIs e insumos', composicao.materiais],
    ['Tributos, BDI e lucro', composicao.tributosMargem],
  ];
  return (
    <ul className="space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
      {partes.map(([nome, valor]) => (
        <li key={nome} className="flex justify-between gap-2">
          <span>{nome}</span>
          <span>{percentual(valor, resultado.valorContrato)}</span>
        </li>
      ))}
    </ul>
  );
}

type PropsDoResumo = {
  resultado: ResumoOrcamento | null;
  calculo: Resultado | null;
  comparacao: Resultado | null;
  repetido: boolean;
  erro: string;
  baixando: TipoDoPdf | null;
  aoBaixar: (tipo: TipoDoPdf) => void;
};

/** Coluna do resultado: valor mensal e anual, composição do preço, tributação escolhida e os botões dos PDFs. */
export function ResumoDoOrcamento({
  resultado,
  calculo,
  comparacao,
  repetido,
  erro,
  baixando,
  aoBaixar,
}: PropsDoResumo) {
  const bloqueado = !resultado || repetido || baixando !== null;
  const icone = (tipo: TipoDoPdf, normal: React.ReactNode) =>
    baixando === tipo ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : normal;
  return (
    <aside
      className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto"
      aria-label="Resultado do orçamento"
    >
      <div className="space-y-4 rounded-lg border border-slate-200 border-t-2 border-t-slate-800 bg-surface p-5">
        <p
          role="note"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
        >
          Tabela de referência de {dataDaTabela}. Salário mínimo usado na insalubridade: {brl(CATALOGO.salarioMinimo)}.
          Confira se os valores estão vigentes antes de usar.
        </p>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valor mensal estimado</p>
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900" aria-live="polite">
          {resultado ? brl(resultado.valorContrato) : '—'}
        </p>
        {resultado && (
          <>
            <Numeros resultado={resultado} />
            <PostosDoResultado resultado={resultado} />
            <Composicao resultado={resultado} />
          </>
        )}
        {calculo && <ResumoDaTributacao calculo={calculo} comparacao={comparacao} />}
        {repetido && (
          <AvisoLateral role="alert" tamanho="pequeno">
            Há postos repetidos (mesma função, turno e adicionais). Some as quantidades em um só posto para gerar o PDF.
          </AvisoLateral>
        )}
        {erro && (
          <AvisoLateral role="alert" tamanho="pequeno">
            {erro}
          </AvisoLateral>
        )}
        <div className="flex flex-col gap-2">
          <Botao type="button" disabled={bloqueado} onClick={() => aoBaixar('orcamento')}>
            {icone('orcamento', <Download size={16} aria-hidden />)} Baixar orçamento (PDF)
          </Botao>
          <Botao type="button" variante="contorno" disabled={bloqueado} onClick={() => aoBaixar('custo')}>
            {icone('custo', <FileText size={16} aria-hidden />)} Relatório de custo detalhado (PDF)
          </Botao>
        </div>
        <p className="text-xs text-slate-500">
          Estimativa com base em tabela de referência (posição de {dataDaTabela}). Confirme a convenção coletiva vigente
          da categoria antes de contratar. Encargos:{' '}
          {(CATALOGO.encargos * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% sobre a folha.
        </p>
      </div>
    </aside>
  );
}
