import { useMemo, useState } from 'react';
import { brl, lerNumero, pontos } from '@/lib/base/formato';
import type { Anexo } from '@/lib/tributos/das';
import { tentar } from '@/lib/tributos/formulario';
import { calcularCbsIbsSimples, escolherParAliquotas } from '@/lib/tributos/simples-cbs-ibs';
import { AvisoLateral } from '@/componentes/ui/aviso';
import { CampoDecimal } from '@/componentes/ui/campo';
import { LinhaDeResultado, MemoriaDeCalculo } from '@/componentes/tributos/partes-do-resultado';
import { SeletorDeAnexo } from '@/componentes/tributos/seletores';

type ParDeTextos = { cbs: string; ibs: string };
type Fatos = { retido: boolean; sublimite: boolean; semIss: boolean; isencao: boolean };

const NOME_DO_PAR = { 'sem-redistribuicao': 'sem redistribuição do ISS', unico: 'par único', 'com-redistribuicao': 'com redistribuição do ISS' } as const;

function Marcacao({ marcada, aoMudar, children }: { marcada: boolean; aoMudar: (marcada: boolean) => void; children: string }) {
  return <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={marcada} onChange={e => aoMudar(e.target.checked)} /> {children}</label>;
}

/** Aba "Simples Nacional — CBS/IBS": a situação do ISS na operação escolhe o par de alíquotas do PGDAS-D. */
export function AbaSimples() {
  const [anexo, setAnexo] = useState<Anexo>('IV');
  const [receita, setReceita] = useState('50000');
  const [fator, setFator] = useState('1');
  const [comRedistribuicao, setComRedistribuicao] = useState<ParDeTextos>({ cbs: '', ibs: '' });
  const [semRedistribuicao, setSemRedistribuicao] = useState<ParDeTextos>({ cbs: '', ibs: '' });
  const [fatos, setFatos] = useState<Fatos>({ retido: true, sublimite: false, semIss: false, isencao: false });
  const [regular, setRegular] = useState(false);

  const par = useMemo(() => escolherParAliquotas({
    anexo, impedimentoSublimite: fatos.sublimite, tribISSQN: fatos.semIss ? 4 : 1, tpBM: fatos.isencao ? 1 : undefined, tpRetISSQN: fatos.retido ? 2 : 1,
  }), [anexo, fatos]);

  const resultado = useMemo(() => {
    const receitaBruta = lerNumero(receita);
    if (receitaBruta === undefined) return { falha: 'Informe a receita bruta do item em reais.' };
    const fracao = lerNumero(fator);
    if (fracao === undefined || fracao > 1) return { falha: 'O fator da receita deve estar entre 0 e 1.' };
    const usado = par.par === 'sem-redistribuicao' ? semRedistribuicao : comRedistribuicao;
    const pCBSSN = lerNumero(usado.cbs); const pIBSSN = lerNumero(usado.ibs);
    if (!regular && (pCBSSN === undefined || pIBSSN === undefined)) {
      return { falha: `Informe a CBS e o IBS efetivos do PGDAS-D (par ${par.par === 'sem-redistribuicao' ? 'sem' : 'com'} redistribuição do ISS).` };
    }
    return tentar(() => calcularCbsIbsSimples({ receita: receitaBruta, fatorReceita: fracao, pCBSSN: pCBSSN ?? 0, pIBSSN: pIBSSN ?? 0, optaRegimeRegular: regular }));
  }, [receita, fator, comRedistribuicao, semRedistribuicao, par, regular]);

  const marcar = (chave: keyof Fatos) => (marcada: boolean) => setFatos({ ...fatos, [chave]: marcada });
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <SeletorDeAnexo id="c-anexo" valor={anexo} aoMudar={setAnexo} indicarFatorR={false} />
      <CampoDecimal id="c-rec" rotulo="Receita bruta do item (R$)" value={receita} aoMudar={setReceita} />
      <CampoDecimal id="c-fator" rotulo="Fração tributada (0 a 1)" value={fator} aoMudar={setFator} />
    </div>
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-slate-600">Situação do ISS na operação (define o par de alíquotas)</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Marcacao marcada={fatos.retido} aoMudar={marcar('retido')}>ISS retido pelo tomador</Marcacao>
        <Marcacao marcada={fatos.sublimite} aoMudar={marcar('sublimite')}>ISS fora do Simples (sublimite)</Marcacao>
        <Marcacao marcada={fatos.semIss} aoMudar={marcar('semIss')}>Sem ISS (imunidade, exportação, não incidência)</Marcacao>
        <Marcacao marcada={fatos.isencao} aoMudar={marcar('isencao')}>Isenção municipal</Marcacao>
      </div>
      <p className="text-xs text-slate-600">Par escolhido: <strong>{NOME_DO_PAR[par.par]}</strong>. {par.motivo}</p>
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-4">
      <CampoDecimal id="c-ccom" rotulo="CBS com redistribuição (%)" value={comRedistribuicao.cbs} aoMudar={v => setComRedistribuicao({ ...comRedistribuicao, cbs: v })} placeholder="do PGDAS-D" />
      <CampoDecimal id="c-icom" rotulo="IBS com redistribuição (%)" value={comRedistribuicao.ibs} aoMudar={v => setComRedistribuicao({ ...comRedistribuicao, ibs: v })} placeholder="do PGDAS-D" />
      <CampoDecimal id="c-csem" rotulo="CBS sem redistribuição (%)" value={semRedistribuicao.cbs} aoMudar={v => setSemRedistribuicao({ ...semRedistribuicao, cbs: v })} placeholder="do PGDAS-D" />
      <CampoDecimal id="c-isem" rotulo="IBS sem redistribuição (%)" value={semRedistribuicao.ibs} aoMudar={v => setSemRedistribuicao({ ...semRedistribuicao, ibs: v })} placeholder="do PGDAS-D" />
    </div>
    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={regular} onChange={e => setRegular(e.target.checked)} /> Optante pelo regime regular de IBS/CBS (receita apurada &quot;por fora&quot; do Simples)</label>
    {'falha' in resultado
      ? <AvisoLateral role="status">{resultado.falha}</AvisoLateral>
      : <ResultadoSimples r={resultado.ok} />}
  </div>;
}

function ResultadoSimples({ r }: { r: ReturnType<typeof calcularCbsIbsSimples> }) {
  return <section aria-label="Resultado do Simples Nacional: CBS e IBS" className="space-y-4">
    {r.calculado
      ? <table className="w-full max-w-md text-sm"><caption className="sr-only">CBS e IBS do Simples Nacional</caption>
        <tbody>
          <LinhaDeResultado nome={`CBS (${pontos(r.pCBSSN)})`} valor={brl(r.vCBS)} />
          <LinhaDeResultado nome={`IBS (${pontos(r.pIBSSN)})`} valor={brl(r.vIBS)} />
          <LinhaDeResultado forte nome="CBS + IBS" valor={brl(r.total)} />
        </tbody>
      </table>
      : <AvisoLateral role="status">{r.motivo ?? 'Não calculado.'}</AvisoLateral>}
    <MemoriaDeCalculo linhas={r.memoria} avisos={r.avisos} />
  </section>;
}
