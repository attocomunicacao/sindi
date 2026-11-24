import type { ReactNode } from 'react';

/** Memória de cálculo (passo a passo) e os avisos de uma conta. */
export function MemoriaDeCalculo({ linhas, avisos }: { linhas: string[]; avisos: string[] }) {
  return (
    <div className="space-y-3 text-xs leading-5 text-slate-600">
      <details open>
        <summary className="cursor-pointer text-sm font-medium text-slate-800">Memória de cálculo</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {linhas.map((linha, i) => (
            <li key={i}>{linha}</li>
          ))}
        </ol>
      </details>
      {avisos.length > 0 && (
        <ul role="note" className="space-y-1 border-l-2 border-amber-400 pl-3 text-slate-700">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Linha de tabela de resultado: nome na coluna de cabeçalho e valor à direita; `forte` marca o total. */
export function LinhaDeResultado({ nome, valor, forte }: { nome: ReactNode; valor: ReactNode; forte?: boolean }) {
  return (
    <tr className={forte ? 'border-t border-slate-300 font-semibold text-slate-900' : ''}>
      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
        {nome}
      </th>
      <td className="py-1.5 text-right tabular-nums">{valor}</td>
    </tr>
  );
}
