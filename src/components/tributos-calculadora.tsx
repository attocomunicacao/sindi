'use client';
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { calcularDas, type Anexo } from '@/lib/tributos/das';
import { ErroTributario } from '@/lib/tributos/decimal';
import { brl, lerNumero, pontos } from '@/lib/tributos/formato';
import { ALIQUOTAS_ESTIMADAS, ANOS, calcularCbsIbsServico, ROTULO_ESTIMATIVA, type AliquotasCbsIbs } from '@/lib/tributos/regime-regular';
import { SERVICOS } from '@/lib/tributos/servicos';
import { calcularCbsIbsSimples, escolherParAliquotas } from '@/lib/tributos/simples-cbs-ibs';

// Todo o cálculo roda no navegador, com as mesmas bibliotecas puras do servidor: nada é enviado nem gravado.
const campo = 'w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 focus-visible:border-amber-400 focus-visible:outline-none';
const rotulo = 'mb-1 block text-xs font-medium text-slate-600';
const ABAS = [
  { id: 'regular', nome: 'Regime regular (CBS/IBS de um serviço)' },
  { id: 'das', nome: 'Simples Nacional — DAS' },
  { id: 'simples', nome: 'Simples Nacional — CBS/IBS' },
] as const;
type AbaId = (typeof ABAS)[number]['id'];

const texto = (n: number) => String(n).replace('.', ',');
const padraoAliquotas = (ano: number) => { const a = ALIQUOTAS_ESTIMADAS[ano]; return a ? { cbs: texto(a.cbs), ibsUf: texto(a.ibsUf), ibsMun: texto(a.ibsMun) } : { cbs: '0,9', ibsUf: '0,1', ibsMun: '0' }; };

function Entrada({ id, rotulo: nome, valor, aoMudar, dica }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void; dica?: string }) {
  return <div><label htmlFor={id} className={rotulo}>{nome}</label><input id={id} className={campo} inputMode="decimal" value={valor} onChange={e => aoMudar(e.target.value)} placeholder={dica} /></div>;
}
function Memoria({ linhas, avisos }: { linhas: string[]; avisos: string[] }) {
  return <div className="space-y-3 text-xs leading-5 text-slate-600">
    <details open><summary className="cursor-pointer text-sm font-medium text-slate-800">Memória de cálculo</summary><ol className="mt-2 list-decimal space-y-1 pl-5">{linhas.map((l, i) => <li key={i}>{l}</li>)}</ol></details>
    {avisos.length > 0 && <ul role="note" className="space-y-1 border-l-2 border-amber-400 pl-3 text-slate-700">{avisos.map(a => <li key={a}>{a}</li>)}</ul>}
  </div>;
}
function Falha({ mensagem }: { mensagem: string }) { return <p role="status" className="border-l-2 border-amber-400 pl-3 text-sm text-slate-700">{mensagem}</p>; }
const Linha = ({ nome, valor, forte }: { nome: ReactNode; valor: ReactNode; forte?: boolean }) =>
  <tr className={forte ? 'border-t border-slate-300 font-semibold text-slate-900' : ''}><th scope="row" className="py-1.5 pr-3 text-left font-normal">{nome}</th><td className="py-1.5 text-right tabular-nums">{valor}</td></tr>;

/** Resolve o cálculo capturando só erro de entrada; qualquer outro erro continua sendo erro de programa. */
function tentar<T>(f: () => T): { ok: T } | { falha: string } {
  try { return { ok: f() }; } catch (causa) { if (causa instanceof ErroTributario) return { falha: causa.message }; throw causa; }
}

function AbaRegular() {
  const [base, setBase] = useState('100000'); const [ano, setAno] = useState(2026); const [servicoId, setServicoId] = useState(SERVICOS[0].id); const [aliq, setAliq] = useState(padraoAliquotas(2027));
  const r = useMemo(() => {
    const b = lerNumero(base); if (b === undefined) return { falha: 'Informe a base de cálculo (valor do serviço) em reais.' };
    let aliquotas: AliquotasCbsIbs | undefined;
    if (ano >= 2027) {
      const a = { cbs: lerNumero(aliq.cbs), ibsUf: lerNumero(aliq.ibsUf), ibsMun: lerNumero(aliq.ibsMun) };
      if (a.cbs === undefined || a.ibsUf === undefined || a.ibsMun === undefined) return { falha: 'Informe as três alíquotas (CBS, IBS UF e IBS município).' };
      aliquotas = { cbs: a.cbs, ibsUf: a.ibsUf, ibsMun: a.ibsMun };
    }
    return tentar(() => calcularCbsIbsServico({ base: b, ano, servicoId, aliquotas }));
  }, [base, ano, servicoId, aliq]);
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <Entrada id="r-base" rotulo="Base de cálculo — valor do serviço (R$)" valor={base} aoMudar={setBase} />
      <div><label htmlFor="r-ano" className={rotulo}>Ano</label><select id="r-ano" className={campo} value={ano} onChange={e => { const a = Number(e.target.value); setAno(a); if (a >= 2027) setAliq(padraoAliquotas(a)); }}>{ANOS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
      <div><label htmlFor="r-serv" className={rotulo}>Serviço</label><select id="r-serv" className={campo} value={servicoId} onChange={e => setServicoId(e.target.value)}>{SERVICOS.map(s => <option key={s.id} value={s.id}>{s.lc116} — {s.descricao}</option>)}</select></div>
    </div>
    {ano >= 2027 && <fieldset className="space-y-2"><legend className="text-xs font-medium text-slate-600">Alíquotas de {ano} (pontos percentuais; editáveis)</legend>
      <div className="grid gap-3 sm:grid-cols-3"><Entrada id="r-cbs" rotulo="CBS (%)" valor={aliq.cbs} aoMudar={v => setAliq({ ...aliq, cbs: v })} /><Entrada id="r-uf" rotulo="IBS estadual (%)" valor={aliq.ibsUf} aoMudar={v => setAliq({ ...aliq, ibsUf: v })} /><Entrada id="r-mun" rotulo="IBS municipal (%)" valor={aliq.ibsMun} aoMudar={v => setAliq({ ...aliq, ibsMun: v })} /></div>
      <p className="text-xs text-slate-600">Cálculo simulado: valores padrão são {ROTULO_ESTIMATIVA}.</p></fieldset>}
    {'falha' in r ? <Falha mensagem={r.falha} /> : <section aria-label="Resultado do regime regular" className="space-y-4">
      {r.ok.simulado && <p role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Cálculo simulado: alíquotas de {r.ok.ano} não publicadas pela Receita.</p>}
      <table className="w-full max-w-md text-sm"><caption className="sr-only">CBS e IBS do serviço</caption><tbody>
        <Linha nome={`CBS (${pontos(r.ok.aliquotas.cbs)})`} valor={brl(r.ok.vCBS)} /><Linha nome={`IBS estadual (${pontos(r.ok.aliquotas.ibsUf)})`} valor={brl(r.ok.vIBSUF)} />
        <Linha nome={`IBS municipal (${pontos(r.ok.aliquotas.ibsMun)})`} valor={brl(r.ok.vIBSMun)} /><Linha nome="IBS total" valor={brl(r.ok.vIBS)} /><Linha forte nome={r.ok.informativo ? 'CBS + IBS (informativos, sem custo)' : 'CBS + IBS'} valor={brl(r.ok.total)} />
        <Linha nome="Valor do serviço + CBS/IBS" valor={brl(r.ok.informativo ? r.ok.base : r.ok.base + r.ok.total)} /></tbody></table>
      <Memoria linhas={r.ok.memoria} avisos={r.ok.avisos} />
    </section>}
  </div>;
}

function AbaDas() {
  const [anexo, setAnexo] = useState<Anexo>('IV'); const [rbt12, setRbt12] = useState('500000'); const [folha, setFolha] = useState(''); const [receita, setReceita] = useState('50000'); const [ano, setAno] = useState(2026);
  const r = useMemo(() => {
    const rb = lerNumero(rbt12); if (!rb) return { falha: 'Informe a receita bruta dos últimos 12 meses (RBT12), maior que zero.' };
    return tentar(() => calcularDas({ anexo, rbt12: rb, folha12: lerNumero(folha), receitaMes: lerNumero(receita), ano }));
  }, [anexo, rbt12, folha, receita, ano]);
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-5">
      <div><label htmlFor="d-anexo" className={rotulo}>Anexo</label><select id="d-anexo" className={campo} value={anexo} onChange={e => setAnexo(e.target.value as Anexo)}><option value="III">III</option><option value="IV">IV (vigilância, limpeza)</option><option value="V">V (Fator R)</option></select></div>
      <Entrada id="d-rbt" rotulo="RBT12 (R$)" valor={rbt12} aoMudar={setRbt12} /><Entrada id="d-folha" rotulo="Folha 12 meses (R$)" valor={folha} aoMudar={setFolha} dica="para o Fator R" />
      <Entrada id="d-rec" rotulo="Receita do mês (R$)" valor={receita} aoMudar={setReceita} />
      <div><label htmlFor="d-ano" className={rotulo}>Ano</label><select id="d-ano" className={campo} value={ano} onChange={e => setAno(Number(e.target.value))}>{ANOS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
    </div>
    {'falha' in r ? <Falha mensagem={r.falha} /> : <section aria-label="Resultado do DAS" className="space-y-4">
      <p className="text-sm">Alíquota efetiva: <strong className="tabular-nums text-slate-900">{pontos(r.ok.aliquotaEfetiva, 2, 4)}</strong> — Anexo {r.ok.anexoAplicado}{r.ok.fatorR.trocouParaIII ? ' (Fator R)' : ''}, {r.ok.faixa}ª faixa{r.ok.valorDas !== undefined ? <>; DAS do mês <strong className="tabular-nums text-slate-900">{brl(r.ok.valorDas)}</strong></> : null}.</p>
      <table className="w-full max-w-xl text-sm"><caption className="sr-only">Partilha do DAS</caption>
        <thead><tr className="text-xs text-slate-500"><th scope="col" className="py-1 text-left font-medium">Tributo</th><th scope="col" className="py-1 text-right font-medium">% do DAS</th><th scope="col" className="py-1 text-right font-medium">Alíquota sobre a receita</th><th scope="col" className="py-1 text-right font-medium">Valor</th></tr></thead>
        <tbody>{r.ok.partilha.filter(p => p.percentualDoDas > 0).map(p => <tr key={p.tributo}><th scope="row" className="py-1 text-left font-normal">{p.tributo}</th><td className="py-1 text-right tabular-nums">{pontos(p.percentualDoDas)}</td><td className="py-1 text-right tabular-nums">{pontos(p.aliquota, 2, 4)}</td><td className="py-1 text-right tabular-nums">{p.valor !== undefined ? brl(p.valor) : '—'}</td></tr>)}</tbody></table>
      {r.ok.issLimitado && <p className="text-xs text-slate-700">O ISS foi limitado a 5% e o excedente repartido entre os tributos federais.</p>}
      <Memoria linhas={r.ok.memoria} avisos={r.ok.avisos} />
    </section>}
  </div>;
}

function AbaSimples() {
  const [anexo, setAnexo] = useState<Anexo>('IV'); const [receita, setReceita] = useState('50000'); const [fator, setFator] = useState('1');
  const [com, setCom] = useState({ cbs: '', ibs: '' }); const [sem, setSem] = useState({ cbs: '', ibs: '' });
  const [fatos, setFatos] = useState({ retido: true, sublimite: false, semIss: false, isencao: false }); const [regular, setRegular] = useState(false);
  const par = useMemo(() => escolherParAliquotas({ anexo, impedimentoSublimite: fatos.sublimite, tribISSQN: fatos.semIss ? 4 : 1, tpBM: fatos.isencao ? 1 : undefined, tpRetISSQN: fatos.retido ? 2 : 1 }), [anexo, fatos]);
  const r = useMemo(() => {
    const rec = lerNumero(receita); if (rec === undefined) return { falha: 'Informe a receita bruta do item em reais.' };
    const f = lerNumero(fator); if (f === undefined || f > 1) return { falha: 'O fator da receita deve estar entre 0 e 1.' };
    const usado = par.par === 'sem-redistribuicao' ? sem : com;
    const pc = lerNumero(usado.cbs), pi = lerNumero(usado.ibs);
    if (!regular && (pc === undefined || pi === undefined)) return { falha: `Informe a CBS e o IBS efetivos do PGDAS-D (par ${par.par === 'sem-redistribuicao' ? 'sem' : 'com'} redistribuição do ISS).` };
    return tentar(() => calcularCbsIbsSimples({ receita: rec, fatorReceita: f, pCBSSN: pc ?? 0, pIBSSN: pi ?? 0, optaRegimeRegular: regular }));
  }, [receita, fator, com, sem, par, regular]);
  const marca = (chave: keyof typeof fatos, nome: string) => <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={fatos[chave]} onChange={e => setFatos({ ...fatos, [chave]: e.target.checked })} /> {nome}</label>;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div><label htmlFor="c-anexo" className={rotulo}>Anexo</label><select id="c-anexo" className={campo} value={anexo} onChange={e => setAnexo(e.target.value as Anexo)}><option value="III">III</option><option value="IV">IV (vigilância, limpeza)</option><option value="V">V</option></select></div>
      <Entrada id="c-rec" rotulo="Receita bruta do item (R$)" valor={receita} aoMudar={setReceita} /><Entrada id="c-fator" rotulo="Fração tributada (0 a 1)" valor={fator} aoMudar={setFator} />
    </div>
    <fieldset className="space-y-2"><legend className="text-xs font-medium text-slate-600">Situação do ISS na operação (define o par de alíquotas)</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{marca('retido', 'ISS retido pelo tomador')}{marca('sublimite', 'ISS fora do Simples (sublimite)')}{marca('semIss', 'Sem ISS (imunidade, exportação, não incidência)')}{marca('isencao', 'Isenção municipal')}</div>
      <p className="text-xs text-slate-600">Par escolhido: <strong>{par.par === 'sem-redistribuicao' ? 'sem redistribuição do ISS' : par.par === 'unico' ? 'par único' : 'com redistribuição do ISS'}</strong>. {par.motivo}</p></fieldset>
    <div className="grid gap-3 sm:grid-cols-4">
      <Entrada id="c-ccom" rotulo="CBS com redistribuição (%)" valor={com.cbs} aoMudar={v => setCom({ ...com, cbs: v })} dica="do PGDAS-D" /><Entrada id="c-icom" rotulo="IBS com redistribuição (%)" valor={com.ibs} aoMudar={v => setCom({ ...com, ibs: v })} dica="do PGDAS-D" />
      <Entrada id="c-csem" rotulo="CBS sem redistribuição (%)" valor={sem.cbs} aoMudar={v => setSem({ ...sem, cbs: v })} dica="do PGDAS-D" /><Entrada id="c-isem" rotulo="IBS sem redistribuição (%)" valor={sem.ibs} aoMudar={v => setSem({ ...sem, ibs: v })} dica="do PGDAS-D" />
    </div>
    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={regular} onChange={e => setRegular(e.target.checked)} /> Optante pelo regime regular de IBS/CBS (receita apurada &quot;por fora&quot; do Simples)</label>
    {'falha' in r ? <Falha mensagem={r.falha} /> : <section aria-label="Resultado do Simples Nacional: CBS e IBS" className="space-y-4">
      {r.ok.calculado ? <table className="w-full max-w-md text-sm"><caption className="sr-only">CBS e IBS do Simples Nacional</caption><tbody>
        <Linha nome={`CBS (${pontos(r.ok.pCBSSN)})`} valor={brl(r.ok.vCBS)} /><Linha nome={`IBS (${pontos(r.ok.pIBSSN)})`} valor={brl(r.ok.vIBS)} /><Linha forte nome="CBS + IBS" valor={brl(r.ok.total)} /></tbody></table>
        : <Falha mensagem={r.ok.motivo ?? 'Não calculado.'} />}
      <Memoria linhas={r.ok.memoria} avisos={r.ok.avisos} />
    </section>}
  </div>;
}

export function TributosCalculadora() {
  const base = useId(); const [aba, setAba] = useState<AbaId>('regular');
  const mover = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!passo) return;
    e.preventDefault(); const destino = ABAS[(i + passo + ABAS.length) % ABAS.length]; setAba(destino.id);
    document.getElementById(`${base}-aba-${destino.id}`)?.focus();
  };
  return <div className="space-y-6">
    <div role="tablist" aria-label="Calculadoras de tributos" className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200">
      {ABAS.map((a, i) => <button key={a.id} type="button" role="tab" id={`${base}-aba-${a.id}`} aria-selected={aba === a.id} aria-controls={`${base}-painel-${a.id}`} tabIndex={aba === a.id ? 0 : -1}
        onClick={() => setAba(a.id)} onKeyDown={e => mover(e, i)}
        className={`-mb-px border-b-2 px-1 py-2 text-sm font-medium ${aba === a.id ? 'border-amber-400 text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{a.nome}</button>)}
    </div>
    {ABAS.map(a => <div key={a.id} role="tabpanel" id={`${base}-painel-${a.id}`} aria-labelledby={`${base}-aba-${a.id}`} hidden={aba !== a.id} tabIndex={0}>
      {aba === a.id && (a.id === 'regular' ? <AbaRegular /> : a.id === 'das' ? <AbaDas /> : <AbaSimples />)}</div>)}
    <p className="text-xs leading-5 text-slate-500">Estimativa para planejamento, calculada no seu navegador (nada é enviado). Regime regular e CBS/IBS do Simples seguem a lógica da Calculadora da Receita Federal (MIT); as tabelas do DAS vêm da LC 123/2006 e precisam de conferência antes de uso comercial. Não substitui contador nem parecer jurídico.</p>
  </div>;
}
