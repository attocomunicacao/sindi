import { useMemo, useState } from 'react';
import { brl, lerNumero, pontos } from '@/lib/base/formato';
import { calcularDas, type Anexo } from '@/lib/tributos/das';
import { tentar } from '@/lib/tributos/formulario';
import { AvisoLateral } from '@/componentes/ui/aviso';
import { CampoDecimal } from '@/componentes/ui/campo';
import { MemoriaDeCalculo } from '@/componentes/tributos/partes-do-resultado';
import { SeletorDeAnexo, SeletorDeAno } from '@/componentes/tributos/seletores';

/** Aba "Simples Nacional — DAS": alíquota efetiva, partilha entre os tributos e o valor do DAS do mês. */
export function AbaDas() {
  const [anexo, setAnexo] = useState<Anexo>('IV');
  const [rbt12, setRbt12] = useState('500000');
  const [folha, setFolha] = useState('');
  const [receita, setReceita] = useState('50000');
  const [ano, setAno] = useState(2026);

  const resultado = useMemo(() => {
    const receitaBruta12 = lerNumero(rbt12);
    if (!receitaBruta12) return { falha: 'Informe a receita bruta dos últimos 12 meses (RBT12), maior que zero.' };
    return tentar(() => calcularDas({ anexo, rbt12: receitaBruta12, folha12: lerNumero(folha), receitaMes: lerNumero(receita), ano }));
  }, [anexo, rbt12, folha, receita, ano]);

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-5">
      <SeletorDeAnexo id="d-anexo" valor={anexo} aoMudar={setAnexo} />
      <CampoDecimal id="d-rbt" rotulo="RBT12 (R$)" value={rbt12} aoMudar={setRbt12} />
      <CampoDecimal id="d-folha" rotulo="Folha 12 meses (R$)" value={folha} aoMudar={setFolha} placeholder="para o Fator R" />
      <CampoDecimal id="d-rec" rotulo="Receita do mês (R$)" value={receita} aoMudar={setReceita} />
      <SeletorDeAno id="d-ano" valor={ano} aoMudar={setAno} />
    </div>
    {'falha' in resultado
      ? <AvisoLateral role="status">{resultado.falha}</AvisoLateral>
      : <ResultadoDoDas r={resultado.ok} />}
  </div>;
}

function ResultadoDoDas({ r }: { r: ReturnType<typeof calcularDas> }) {
  return <section aria-label="Resultado do DAS" className="space-y-4">
    <p className="text-sm">
      Alíquota efetiva: <strong className="tabular-nums text-slate-900">{pontos(r.aliquotaEfetiva, 2, 4)}</strong> — Anexo {r.anexoAplicado}{r.fatorR.trocouParaIII ? ' (Fator R)' : ''}, {r.faixa}ª faixa
      {r.valorDas !== undefined ? <>; DAS do mês <strong className="tabular-nums text-slate-900">{brl(r.valorDas)}</strong></> : null}.
    </p>
    <table className="w-full max-w-xl text-sm"><caption className="sr-only">Partilha do DAS</caption>
      <thead><tr className="text-xs text-slate-500">
        <th scope="col" className="py-1 text-left font-medium">Tributo</th><th scope="col" className="py-1 text-right font-medium">% do DAS</th>
        <th scope="col" className="py-1 text-right font-medium">Alíquota sobre a receita</th><th scope="col" className="py-1 text-right font-medium">Valor</th>
      </tr></thead>
      <tbody>{r.partilha.filter(p => p.percentualDoDas > 0).map(p => <tr key={p.tributo}>
        <th scope="row" className="py-1 text-left font-normal">{p.tributo}</th>
        <td className="py-1 text-right tabular-nums">{pontos(p.percentualDoDas)}</td>
        <td className="py-1 text-right tabular-nums">{pontos(p.aliquota, 2, 4)}</td>
        <td className="py-1 text-right tabular-nums">{p.valor !== undefined ? brl(p.valor) : '—'}</td>
      </tr>)}</tbody>
    </table>
    {r.issLimitado && <p className="text-xs text-slate-700">O ISS foi limitado a 5% e o excedente repartido entre os tributos federais.</p>}
    <MemoriaDeCalculo linhas={r.memoria} avisos={r.avisos} />
  </section>;
}
