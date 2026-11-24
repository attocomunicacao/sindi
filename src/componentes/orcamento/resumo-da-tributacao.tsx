import { brl, pontos } from '@/lib/base/formato';
import type { Resultado } from '@/lib/orcamento/calculo';

type Tributacao = NonNullable<Resultado['tributacao']>;

function Linha({ nome, valor, forte = false }: { nome: React.ReactNode; valor: string; forte?: boolean }) {
  return (
    <>
      <dt className={forte ? 'font-semibold text-slate-800' : undefined}>{nome}</dt>
      <dd className={`text-right ${forte ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>{valor}</dd>
    </>
  );
}

function NotaDaReforma({ nota }: { nota: NonNullable<Tributacao['nota']> }) {
  const sufixo = nota.informativo ? ' (sem custo)' : '';
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
      <Linha nome="Valor do serviço" valor={brl(nota.valorServico)} />
      <Linha nome={`CBS${sufixo}`} valor={brl(nota.cbs)} />
      <Linha nome={`IBS${sufixo}`} valor={brl(nota.ibs)} />
      <Linha forte nome="Total da nota" valor={brl(nota.totalNota)} />
    </dl>
  );
}

function DasDoSimples({ das }: { das: NonNullable<Tributacao['das']> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
      <Linha nome="Alíquota efetiva do DAS" valor={pontos(das.aliquotaEfetiva, 4, 4)} />
      <Linha nome="DAS mensal" valor={brl(das.valorDas ?? 0)} />
    </dl>
  );
}

function Comparacao({ calculo, comparacao }: { calculo: Resultado; comparacao: Resultado }) {
  const { tributacao } = calculo;
  return (
    <table className="w-full text-left">
      <caption className="sr-only">Comparação entre as regras atuais e a tributação escolhida</caption>
      <thead>
        <tr>
          <th scope="col" className="pb-1 font-medium text-slate-500">
            Valor mensal
          </th>
          <th scope="col" className="pb-1 text-right font-medium text-slate-500">
            Valor
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="font-normal">
            Regras atuais
          </th>
          <td className="text-right">{brl(comparacao.valorContrato)}</td>
        </tr>
        <tr>
          <th scope="row" className="font-normal">
            {tributacao?.modo === 'reforma' ? 'Reforma (valor do serviço)' : 'Simples Nacional'}
          </th>
          <td className="text-right">{brl(calculo.valorContrato)}</td>
        </tr>
        {tributacao?.nota && (
          <tr>
            <th scope="row" className="font-normal">
              Reforma (total da nota)
            </th>
            <td className="text-right">{brl(tributacao.nota.totalNota)}</td>
          </tr>
        )}
        <tr>
          <th scope="row" className="font-semibold text-slate-800">
            Diferença no serviço
          </th>
          <td className="text-right font-semibold text-slate-800">
            {brl(calculo.valorContrato - comparacao.valorContrato)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Bloco "Tributação escolhida": nota da Reforma ou DAS do Simples, comparação com as regras atuais, avisos e a memória de cálculo. */
export function ResumoDaTributacao({ calculo, comparacao }: { calculo: Resultado; comparacao: Resultado | null }) {
  const { tributacao } = calculo;
  if (!tributacao) return null;
  return (
    <div
      className="space-y-2 border-t border-slate-200 pt-3 text-xs text-slate-600"
      role="group"
      aria-label="Tributação escolhida"
    >
      <p className="font-semibold uppercase tracking-wider text-slate-500">{tributacao.rotulo}</p>
      {tributacao.nota && <NotaDaReforma nota={tributacao.nota} />}
      {tributacao.das && <DasDoSimples das={tributacao.das} />}
      {comparacao && <Comparacao calculo={calculo} comparacao={comparacao} />}
      <ul className="list-disc space-y-1 pl-4">
        {tributacao.avisos.slice(0, 3).map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer font-medium text-slate-700">Memória de cálculo</summary>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {tributacao.memoria.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
          {tributacao.avisos.slice(3).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
