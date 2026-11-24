import { useMemo, useState } from 'react';
import { brl, lerNumero, pontos } from '@/lib/base/formato';
import { aliquotasEmTexto, tentar } from '@/lib/tributos/formulario';
import { calcularCbsIbsServico, ROTULO_ESTIMATIVA, type AliquotasCbsIbs } from '@/lib/tributos/regime-regular';
import { SERVICOS } from '@/lib/tributos/servicos';
import { AvisoLateral } from '@/componentes/ui/aviso';
import { CampoDecimal } from '@/componentes/ui/campo';
import { Seletor } from '@/componentes/ui/seletor';
import { LinhaDeResultado, MemoriaDeCalculo } from '@/componentes/tributos/partes-do-resultado';
import { SeletorDeAno } from '@/componentes/tributos/seletores';

type Textos = ReturnType<typeof aliquotasEmTexto>;

/** Alíquotas editáveis só existem a partir de 2027; antes disso o cálculo usa as de teste de 2026. */
function lerAliquotas(ano: number, textos: Textos): AliquotasCbsIbs | undefined | 'incompletas' {
  if (ano < 2027) return undefined;
  const a = { cbs: lerNumero(textos.cbs), ibsUf: lerNumero(textos.ibsUf), ibsMun: lerNumero(textos.ibsMun) };
  if (a.cbs === undefined || a.ibsUf === undefined || a.ibsMun === undefined) return 'incompletas';
  return { cbs: a.cbs, ibsUf: a.ibsUf, ibsMun: a.ibsMun };
}

/** Aba "Regime regular": CBS e IBS de um serviço, com alíquotas do ano. */
export function AbaRegimeRegular() {
  const [base, setBase] = useState('100000');
  const [ano, setAno] = useState(2026);
  const [servicoId, setServicoId] = useState(SERVICOS[0].id);
  const [aliquotas, setAliquotas] = useState(aliquotasEmTexto(2027));

  const resultado = useMemo(() => {
    const valorBase = lerNumero(base);
    if (valorBase === undefined) return { falha: 'Informe a base de cálculo (valor do serviço) em reais.' };
    const informadas = lerAliquotas(ano, aliquotas);
    if (informadas === 'incompletas') return { falha: 'Informe as três alíquotas (CBS, IBS UF e IBS município).' };
    return tentar(() => calcularCbsIbsServico({ base: valorBase, ano, servicoId, aliquotas: informadas }));
  }, [base, ano, servicoId, aliquotas]);

  const trocarAno = (novo: number) => { setAno(novo); if (novo >= 2027) setAliquotas(aliquotasEmTexto(novo)); };
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <CampoDecimal id="r-base" rotulo="Base de cálculo — valor do serviço (R$)" value={base} aoMudar={setBase} />
      <SeletorDeAno id="r-ano" valor={ano} aoMudar={trocarAno} />
      <Seletor id="r-serv" rotulo="Serviço" value={servicoId} aoMudar={setServicoId}>
        {SERVICOS.map(s => <option key={s.id} value={s.id}>{s.lc116} — {s.descricao}</option>)}
      </Seletor>
    </div>
    {ano >= 2027 && <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-slate-600">Alíquotas de {ano} (pontos percentuais; editáveis)</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoDecimal id="r-cbs" rotulo="CBS (%)" value={aliquotas.cbs} aoMudar={v => setAliquotas({ ...aliquotas, cbs: v })} />
        <CampoDecimal id="r-uf" rotulo="IBS estadual (%)" value={aliquotas.ibsUf} aoMudar={v => setAliquotas({ ...aliquotas, ibsUf: v })} />
        <CampoDecimal id="r-mun" rotulo="IBS municipal (%)" value={aliquotas.ibsMun} aoMudar={v => setAliquotas({ ...aliquotas, ibsMun: v })} />
      </div>
      <p className="text-xs text-slate-600">Cálculo simulado: valores padrão são {ROTULO_ESTIMATIVA}.</p>
    </fieldset>}
    {'falha' in resultado
      ? <AvisoLateral role="status">{resultado.falha}</AvisoLateral>
      : <ResultadoRegular r={resultado.ok} />}
  </div>;
}

function ResultadoRegular({ r }: { r: ReturnType<typeof calcularCbsIbsServico> }) {
  return <section aria-label="Resultado do regime regular" className="space-y-4">
    {r.simulado && <p role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Cálculo simulado: alíquotas de {r.ano} não publicadas pela Receita.</p>}
    <table className="w-full max-w-md text-sm"><caption className="sr-only">CBS e IBS do serviço</caption>
      <tbody>
        <LinhaDeResultado nome={`CBS (${pontos(r.aliquotas.cbs)})`} valor={brl(r.vCBS)} />
        <LinhaDeResultado nome={`IBS estadual (${pontos(r.aliquotas.ibsUf)})`} valor={brl(r.vIBSUF)} />
        <LinhaDeResultado nome={`IBS municipal (${pontos(r.aliquotas.ibsMun)})`} valor={brl(r.vIBSMun)} />
        <LinhaDeResultado nome="IBS total" valor={brl(r.vIBS)} />
        <LinhaDeResultado forte nome={r.informativo ? 'CBS + IBS (informativos, sem custo)' : 'CBS + IBS'} valor={brl(r.total)} />
        <LinhaDeResultado nome="Valor do serviço + CBS/IBS" valor={brl(r.informativo ? r.base : r.base + r.total)} />
      </tbody>
    </table>
    <MemoriaDeCalculo linhas={r.memoria} avisos={r.avisos} />
  </section>;
}
