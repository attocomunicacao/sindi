import { Trash2 } from 'lucide-react';
import { brl } from '@/lib/base/formato';
import type { Resultado } from '@/lib/orcamento/calculo';
import { CampoDeTexto } from '@/componentes/ui/campo';
import { Seletor } from '@/componentes/ui/seletor';
import { CATALOGO } from '@/componentes/orcamento/catalogo';
import type { Posto } from '@/componentes/orcamento/posto';

type PropsDoPosto = {
  posto: Posto; numero: number; podeRemover: boolean;
  /** O que a conta fez com este posto (para avisar quando um adicional foi descartado). */
  conta?: Resultado['postos'][number];
  aoAtualizar: (chave: number, mudanca: Partial<Posto>) => void; aoRemover: (chave: number) => void;
};

function AvisoDeAdicional({ conta }: { conta: Resultado['postos'][number] }) {
  return <p className="basis-full text-xs text-amber-800" role="status">Periculosidade e insalubridade não se acumulam (CLT, art. 193, § 2º): entra só {conta.adicional === 'periculosidade' ? 'a periculosidade' : 'a insalubridade'}, por ser a maior.</p>;
}

/** Um posto de trabalho: função, quantidade, turno e adicionais. Trocar a função traz os adicionais dela. */
export function PostoDeTrabalho({ posto, numero, podeRemover, conta, aoAtualizar, aoRemover }: PropsDoPosto) {
  const { chave } = posto;
  const funcao = CATALOGO.funcoes.find(f => f.id === posto.funcaoId);
  const trocarFuncao = (id: string) => {
    const nova = CATALOGO.funcoes.find(f => f.id === id)!;
    aoAtualizar(chave, { funcaoId: nova.id, turno: nova.permiteNoturno ? posto.turno : 'diurno', periculosidade: nova.periculosidade > 0, insalubridade: nova.insalubridade as Posto['insalubridade'] });
  };
  return <fieldset className="border-t border-slate-200 pt-4 first-of-type:border-t-0 first-of-type:pt-0">
    <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Posto {numero}</legend>
    <div className="grid gap-3 sm:grid-cols-[1fr_110px_120px]">
      <Seletor id={`f-${chave}`} rotulo="Função" value={posto.funcaoId} aoMudar={trocarFuncao}>
        {CATALOGO.funcoes.map(f => <option key={f.id} value={f.id}>{f.nome} — {brl(f.salario)}</option>)}
      </Seletor>
      <CampoDeTexto id={`q-${chave}`} rotulo="Quantidade" type="number" min={1} max={500} value={posto.quantidade}
        aoMudar={v => aoAtualizar(chave, { quantidade: Math.max(1, Math.min(500, Math.floor(Number(v)) || 1)) })} />
      <Seletor id={`t-${chave}`} rotulo="Turno" value={posto.turno} disabled={!funcao?.permiteNoturno} aoMudar={v => aoAtualizar(chave, { turno: v as Posto['turno'] })}>
        <option value="diurno">Diurno</option><option value="noturno">Noturno</option>
      </Seletor>
    </div>
    <div className="mt-3 flex flex-wrap items-end gap-4 text-sm">
      <label className="flex items-center gap-2 text-slate-700">
        <input type="checkbox" checked={posto.periculosidade} onChange={e => aoAtualizar(chave, { periculosidade: e.target.checked })} /> Periculosidade (30%)
      </label>
      <Seletor id={`i-${chave}`} rotulo="Insalubridade" className="w-40" value={posto.insalubridade} aoMudar={v => aoAtualizar(chave, { insalubridade: Number(v) as Posto['insalubridade'] })}>
        <option value={0}>Não</option><option value={0.1}>10% (mínimo)</option><option value={0.2}>20% (médio)</option><option value={0.4}>40% (máximo)</option>
      </Seletor>
      {posto.turno === 'noturno' && <CampoDeTexto id={`h-${chave}`} rotulo="Horas noturnas/mês" type="number" min={0} max={220} className="w-32"
        placeholder={String(CATALOGO.horasNoturnasPadrao)} value={posto.horasNoturnas} aoMudar={v => aoAtualizar(chave, { horasNoturnas: v })} />}
      {conta?.adicionalDescartado && <AvisoDeAdicional conta={conta} />}
      {podeRemover && <button type="button" onClick={() => aoRemover(chave)} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-red-700" aria-label={`Remover posto ${numero}`}><Trash2 size={14} aria-hidden /> Remover</button>}
    </div>
  </fieldset>;
}
