'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calcularOrcamento, type OrcamentoEntrada } from '@/lib/orcamento/calculo';
import { catalogoPublico, type CatalogoPublico } from '@/lib/orcamento/catalogo-publico';
import { resumoDoOrcamento } from '@/lib/orcamento/resumo';
import type { TributacaoEntrada } from '@/lib/orcamento/tributacao';
import { ALIQUOTAS_ESTIMADAS, ANOS, ROTULO_ESTIMATIVA } from '@/lib/tributos/regime-regular';
import type { Anexo } from '@/lib/tributos/das';
import { lerNumero } from '@/lib/tributos/formato';

type FuncaoCat = CatalogoPublico['funcoes'][number];
type Posto = { chave: number; funcaoId: string; quantidade: number; turno: 'diurno' | 'noturno'; periculosidade: boolean; insalubridade: 0 | 0.1 | 0.2 | 0.4; horasNoturnas: string };
type Insumo = { categoria: string; id: string; quantidade: number };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const campo = 'w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 focus-visible:border-amber-400 focus-visible:outline-none';
const rotulo = 'mb-1 block text-xs font-medium text-slate-600';
const titulo = 'flex flex-wrap items-baseline gap-x-3 border-b-2 border-slate-800 pb-2 text-lg font-semibold text-slate-900';
const numeroDaSecao = 'text-sm font-normal tabular-nums text-slate-500';
const opcional = 'text-sm font-normal text-slate-500';
// O catálogo e o cálculo vêm das mesmas bibliotecas do servidor: o resultado aparece na hora, sem ida à rede, e o PDF (gerado no servidor) usa a mesma conta.
const CATALOGO = catalogoPublico();
const pct = (v: number, casas = 2) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
type ModoTributacao = 'atual' | 'reforma' | 'simples';
const textoAliquotas = (ano: number) => { const a = ALIQUOTAS_ESTIMADAS[ano] ?? { cbs: 0.9, ibsUf: 0.1, ibsMun: 0 }; return { cbs: String(a.cbs).replace('.', ','), ibsUf: String(a.ibsUf).replace('.', ','), ibsMun: String(a.ibsMun).replace('.', ',') }; };
let proximaChave = 1;
/** Um posto novo já traz os adicionais da função (o que está na tela é o que entra no cálculo). */
const novoPosto = (funcaoId: string, quantidade = 1, turno: Posto['turno'] = 'diurno'): Posto => {
  const funcao = CATALOGO.funcoes.find(f => f.id === funcaoId);
  return { chave: proximaChave++, funcaoId, quantidade, turno, periculosidade: (funcao?.periculosidade ?? 0) > 0, insalubridade: (funcao?.insalubridade ?? 0) as Posto['insalubridade'], horasNoturnas: '' };
};

/** Postos vindos do chat: ?postos=auxiliar-de-limpeza:3:diurno,auxiliar-de-limpeza:3:noturno&m2=1200 */
function postosDaUrl(parametros: URLSearchParams, funcoes: FuncaoCat[]) {
  const lista = (parametros.get('postos') ?? '').split(',').flatMap(parte => {
    const [id, qtd, turno] = parte.split(':'); const funcao = funcoes.find(f => f.id === id); const quantidade = Number(qtd);
    return funcao && Number.isInteger(quantidade) && quantidade > 0 && quantidade <= 500 ? [novoPosto(id, quantidade, turno === 'noturno' && funcao.permiteNoturno ? 'noturno' : 'diurno')] : [];
  });
  return lista;
}

export function OrcamentoForm() {
  const catalogo = CATALOGO;
  const [postos, setPostos] = useState<Posto[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cliente, setCliente] = useState({ empresa: '', contato: '', local: '', observacoes: '' });
  const [metros, setMetros] = useState('');
  const [iss, setIss] = useState<number>(CATALOGO.issPadrao);
  const [modo, setModo] = useState<ModoTributacao>('atual');
  const [anoReforma, setAnoReforma] = useState(2026);
  const [aliquotas, setAliquotas] = useState(textoAliquotas(2027));
  const [simples, setSimples] = useState({ anexo: 'IV' as Anexo, rbt12: '', folha12: '', ano: 2026, pCBS: '', pIBS: '' });
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState<'' | 'orcamento' | 'custo'>('');
  const [categoriaInsumo, setCategoriaInsumo] = useState('');
  const [itemInsumo, setItemInsumo] = useState('');
  const [qtdInsumo, setQtdInsumo] = useState('1');

  // Postos vindos do chat (?postos=...&m2=...) só podem ser lidos no navegador, depois da montagem.
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const inicial = postosDaUrl(parametros, CATALOGO.funcoes);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a URL só existe no navegador; ler depois da hidratação evita divergir do HTML do servidor
    setPostos(inicial.length ? inicial : [novoPosto(CATALOGO.funcoes[0].id)]);
    const m2 = Number(parametros.get('m2')); if (m2 > 0) setMetros(String(m2));
  }, []);

  const corpo = useMemo(() => {
    const m2 = Number(metros.replace(',', '.'));
    return {
      postos: postos.filter(p => p.quantidade > 0).map(p => ({ funcaoId: p.funcaoId, quantidade: p.quantidade, turno: p.turno, periculosidade: p.periculosidade, insalubridade: p.insalubridade,
        ...(p.turno === 'noturno' && p.horasNoturnas !== '' && Number(p.horasNoturnas) >= 0 ? { horasNoturnas: Number(p.horasNoturnas) } : {}) })),
      iss, ...(m2 > 0 ? { metrosQuadrados: m2 } : {}), ...(insumos.length ? { insumos } : {}),
    };
  }, [postos, insumos, metros, iss]);

  // Tributação escolhida; `pendente` explica por que ainda não vale (ex.: RBT12 em branco). Nesse caso a tela segue nas regras atuais.
  const { tributacao, pendente } = useMemo((): { tributacao?: TributacaoEntrada; pendente?: string } => {
    if (modo === 'reforma') {
      if (anoReforma < 2027) return { tributacao: { modo: 'reforma', ano: anoReforma } };
      const a = { cbs: lerNumero(aliquotas.cbs), ibsUf: lerNumero(aliquotas.ibsUf), ibsMun: lerNumero(aliquotas.ibsMun) };
      if (a.cbs === undefined || a.ibsUf === undefined || a.ibsMun === undefined || Math.max(a.cbs, a.ibsUf, a.ibsMun) > 100) return { pendente: 'Informe as três alíquotas (CBS, IBS UF e IBS município) entre 0 e 100.' };
      const padrao = ALIQUOTAS_ESTIMADAS[anoReforma];
      const igual = padrao && padrao.cbs === a.cbs && padrao.ibsUf === a.ibsUf && padrao.ibsMun === a.ibsMun;
      return { tributacao: { modo: 'reforma', ano: anoReforma, ...(igual ? {} : { aliquotas: { cbs: a.cbs, ibsUf: a.ibsUf, ibsMun: a.ibsMun } }) } };
    }
    if (modo === 'simples') {
      const rbt12 = lerNumero(simples.rbt12); const folha12 = lerNumero(simples.folha12); const pCBSSN = lerNumero(simples.pCBS); const pIBSSN = lerNumero(simples.pIBS);
      if (!rbt12 || rbt12 > 4_800_000) return { pendente: 'Informe a receita bruta dos últimos 12 meses (RBT12), de R$ 0,01 até R$ 4.800.000,00.' };
      if ((simples.pCBS && (pCBSSN === undefined || pCBSSN > 100)) || (simples.pIBS && (pIBSSN === undefined || pIBSSN > 100))) return { pendente: 'Alíquotas de CBS e IBS do Simples devem estar entre 0 e 100.' };
      return { tributacao: { modo: 'simples', anexo: simples.anexo, rbt12, ano: simples.ano, ...(folha12 !== undefined ? { folha12 } : {}), ...(pCBSSN !== undefined ? { pCBSSN } : {}), ...(pIBSSN !== undefined ? { pIBSSN } : {}) } };
    }
    return {};
  }, [modo, anoReforma, aliquotas, simples]);

  const calculo = useMemo(() => {
    if (!corpo.postos.length) return null;
    try { const r = calcularOrcamento({ ...corpo, ...(tributacao ? { tributacao } : {}) } as OrcamentoEntrada); return r.postos.length ? r : null; } catch { return null; }
  }, [corpo, tributacao]);
  // Para comparar, o mesmo orçamento nas regras atuais.
  const comparacao = useMemo(() => {
    if (!calculo?.tributacao) return null;
    try { return calcularOrcamento(corpo as OrcamentoEntrada); } catch { return null; }
  }, [calculo, corpo]);
  const resultado = useMemo(() => (calculo ? resumoDoOrcamento(calculo) : null), [calculo]);
  // Dois postos idênticos são recusados pelo servidor ao gerar o PDF: avisar antes, na tela.
  const repetido = useMemo(() => { const vistos = new Set<string>(); return postos.some(p => { const k = JSON.stringify([p.funcaoId, p.turno, p.periculosidade, p.insalubridade, p.horasNoturnas]); if (vistos.has(k)) return true; vistos.add(k); return false; }); }, [postos]);

  const atualizar = (chave: number, mudanca: Partial<Posto>) => setPostos(lista => lista.map(p => p.chave === chave ? { ...p, ...mudanca } : p));
  const baixar = useCallback(async (tipo: 'orcamento' | 'custo') => {
    if (repetido) return;
    setBaixando(tipo); setErro('');
    try {
      const resposta = await fetch(`/api/orcamento/pdf?tipo=${tipo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, ...(tributacao ? { tributacao } : {}), cliente }) });
      if (!resposta.ok) throw new Error((await resposta.json()).error || 'Não foi possível gerar o PDF.');
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement('a'); link.href = url; link.download = tipo === 'orcamento' ? 'orcamento-terceirizacao.pdf' : 'relatorio-de-custo.pdf'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível gerar o PDF.'); } finally { setBaixando(''); }
  }, [corpo, tributacao, cliente, repetido]);

  if (!postos.length) return <p className="text-sm text-slate-500" role="status">Carregando…</p>;
  const categoria = catalogo.categorias.find(c => c.id === categoriaInsumo);
  const nomeInsumo = (i: Insumo) => catalogo.categorias.find(c => c.id === i.categoria)?.itens.find(x => x.id === i.id)?.nome ?? i.id;

  return <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
    <div className="space-y-12">
      <section aria-labelledby="dados-cliente" className="space-y-4"><h2 id="dados-cliente" className={titulo}><span className={numeroDaSecao}>01</span>Seus dados <span className={opcional}>(opcionais, aparecem no PDF)</span></h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="empresa" className={rotulo}>Empresa</label><input id="empresa" className={campo} maxLength={120} value={cliente.empresa} onChange={e => setCliente({ ...cliente, empresa: e.target.value })} /></div>
          <div><label htmlFor="contato" className={rotulo}>Contato</label><input id="contato" className={campo} maxLength={120} value={cliente.contato} onChange={e => setCliente({ ...cliente, contato: e.target.value })} /></div>
          <div><label htmlFor="local" className={rotulo}>Local da prestação</label><input id="local" className={campo} maxLength={160} value={cliente.local} onChange={e => setCliente({ ...cliente, local: e.target.value })} /></div>
          <div><label htmlFor="metros" className={rotulo}>Área atendida (m²)</label><input id="metros" className={campo} inputMode="decimal" value={metros} onChange={e => setMetros(e.target.value)} placeholder="ex.: 1200" /></div>
        </div>
        <p className="text-xs text-slate-500">Estes dados só são usados para montar o PDF. Nada é gravado nem enviado a terceiros.</p>
      </section>

      <section aria-labelledby="postos" className="space-y-4"><h2 id="postos" className={titulo}><span className={numeroDaSecao}>02</span>Postos de trabalho</h2>
        {postos.map((posto, indice) => {
          const funcao = catalogo.funcoes.find(f => f.id === posto.funcaoId);
          return <fieldset key={posto.chave} className="border-t border-slate-200 pt-4 first-of-type:border-t-0 first-of-type:pt-0"><legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Posto {indice + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_110px_120px]">
              <div><label htmlFor={`f-${posto.chave}`} className={rotulo}>Função</label>
                <select id={`f-${posto.chave}`} className={campo} value={posto.funcaoId} onChange={e => { const nova = catalogo.funcoes.find(f => f.id === e.target.value)!; atualizar(posto.chave, { funcaoId: nova.id, turno: nova.permiteNoturno ? posto.turno : 'diurno', periculosidade: nova.periculosidade > 0, insalubridade: nova.insalubridade as Posto['insalubridade'] }); }}>
                  {catalogo.funcoes.map(f => <option key={f.id} value={f.id}>{f.nome} — {brl(f.salario)}</option>)}</select></div>
              <div><label htmlFor={`q-${posto.chave}`} className={rotulo}>Quantidade</label>
                <input id={`q-${posto.chave}`} type="number" min={1} max={500} className={campo} value={posto.quantidade} onChange={e => atualizar(posto.chave, { quantidade: Math.max(1, Math.min(500, Math.floor(Number(e.target.value)) || 1)) })} /></div>
              <div><label htmlFor={`t-${posto.chave}`} className={rotulo}>Turno</label>
                <select id={`t-${posto.chave}`} className={campo} value={posto.turno} disabled={!funcao?.permiteNoturno} onChange={e => atualizar(posto.chave, { turno: e.target.value as Posto['turno'] })}><option value="diurno">Diurno</option><option value="noturno">Noturno</option></select></div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-4 text-sm">
              <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={posto.periculosidade} onChange={e => atualizar(posto.chave, { periculosidade: e.target.checked })} /> Periculosidade (30%)</label>
              <div><label htmlFor={`i-${posto.chave}`} className={rotulo}>Insalubridade</label>
                <select id={`i-${posto.chave}`} className={campo + ' w-40'} value={posto.insalubridade} onChange={e => atualizar(posto.chave, { insalubridade: Number(e.target.value) as Posto['insalubridade'] })}><option value={0}>Não</option><option value={0.1}>10% (mínimo)</option><option value={0.2}>20% (médio)</option><option value={0.4}>40% (máximo)</option></select></div>
              {posto.turno === 'noturno' && <div><label htmlFor={`h-${posto.chave}`} className={rotulo}>Horas noturnas/mês</label><input id={`h-${posto.chave}`} type="number" min={0} max={220} className={campo + ' w-32'} placeholder={String(catalogo.horasNoturnasPadrao)} value={posto.horasNoturnas} onChange={e => atualizar(posto.chave, { horasNoturnas: e.target.value })} /></div>}
              {calculo?.postos[indice]?.adicionalDescartado && <p className="basis-full text-xs text-amber-800" role="status">Periculosidade e insalubridade não se acumulam (CLT, art. 193, § 2º): entra só {calculo.postos[indice].adicional === 'periculosidade' ? 'a periculosidade' : 'a insalubridade'}, por ser a maior.</p>}
              {postos.length > 1 && <button type="button" onClick={() => setPostos(lista => lista.filter(p => p.chave !== posto.chave))} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-red-700" aria-label={`Remover posto ${indice + 1}`}><Trash2 size={14} aria-hidden /> Remover</button>}
            </div></fieldset>;
        })}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPostos(lista => [...lista, novoPosto((catalogo.funcoes.find(f => !lista.some(p => p.funcaoId === f.id)) ?? catalogo.funcoes[0]).id)])}><Plus size={16} aria-hidden /> Adicionar posto</Button>
          <Button type="button" variant="outline" onClick={() => setPostos([novoPosto('auxiliar-de-limpeza', 3, 'diurno'), novoPosto('auxiliar-de-limpeza', 3, 'noturno')])}>Exemplo: 3 auxiliares de limpeza diurno + 3 noturno</Button>
        </div>
        {catalogo.sobConsulta.length > 0 && <p className="text-xs text-slate-500">Sob consulta (sem salário na tabela de referência): {catalogo.sobConsulta.map(n => n.toLowerCase()).join(', ')}.</p>}
      </section>

      <section aria-labelledby="insumos" className="space-y-4"><h2 id="insumos" className={titulo}><span className={numeroDaSecao}>03</span>Materiais, equipamentos e serviços <span className={opcional}>(opcional)</span></h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px_auto] sm:items-end">
          <div><label htmlFor="cat" className={rotulo}>Categoria</label><select id="cat" className={campo} value={categoriaInsumo} onChange={e => { setCategoriaInsumo(e.target.value); setItemInsumo(''); }}><option value="">Escolha…</option>{catalogo.categorias.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}</select></div>
          <div><label htmlFor="item" className={rotulo}>Item</label><select id="item" className={campo} value={itemInsumo} disabled={!categoria} onChange={e => setItemInsumo(e.target.value)}><option value="">Escolha…</option>{categoria?.itens.map(i => <option key={i.id} value={i.id}>{i.nome} — {brl(i.valor)}</option>)}</select></div>
          <div><label htmlFor="qi" className={rotulo}>Qtde</label><input id="qi" type="number" min={1} className={campo} value={qtdInsumo} onChange={e => setQtdInsumo(e.target.value)} /></div>
          <Button type="button" variant="outline" disabled={!categoria || !itemInsumo || !(Number(qtdInsumo) > 0)} onClick={() => { setInsumos(l => [...l.filter(i => !(i.categoria === categoriaInsumo && i.id === itemInsumo)), { categoria: categoriaInsumo, id: itemInsumo, quantidade: Number(qtdInsumo) }]); setItemInsumo(''); }}>Incluir</Button>
        </div>
        {insumos.length > 0 && <ul className="divide-y divide-slate-200 border-y border-slate-200 text-sm">{insumos.map(i => <li key={i.categoria + i.id} className="flex items-center justify-between gap-3 py-2.5"><span>{i.quantidade} × {nomeInsumo(i)}</span>
          <button type="button" onClick={() => setInsumos(l => l.filter(x => x !== i))} className="text-xs text-slate-500 hover:text-red-700" aria-label={`Remover ${nomeInsumo(i)}`}>Remover</button></li>)}</ul>}
      </section>

      <section aria-labelledby="tributos" className="space-y-4"><h2 id="tributos" className={titulo}><span className={numeroDaSecao}>04</span>Tributos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="modo-tributacao" className={rotulo}>Tributação</label>
            <select id="modo-tributacao" className={campo} value={modo} onChange={e => setModo(e.target.value as ModoTributacao)}>
              <option value="atual">Regras atuais (ISS, PIS, COFINS)</option><option value="reforma">Reforma Tributária (CBS/IBS)</option><option value="simples">Simples Nacional (DAS)</option></select></div>
          {modo !== 'simples' && <div><label htmlFor="iss" className={rotulo}>ISS do município da prestação</label>
            <select id="iss" className={campo} value={iss ?? ''} onChange={e => setIss(Number(e.target.value))}>{catalogo.iss.map(v => <option key={v} value={v}>{(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</option>)}</select></div>}
        </div>
        {modo === 'atual' && <p className="text-xs text-slate-500">PIS, COFINS, contribuição social, IRPJ, BDI e lucro seguem a tabela de referência.</p>}
        {modo === 'reforma' && <div className="space-y-3">
          <div className="max-w-xs"><label htmlFor="ano-reforma" className={rotulo}>Ano da prestação</label>
            <select id="ano-reforma" className={campo} value={anoReforma} onChange={e => { const ano = Number(e.target.value); setAnoReforma(ano); if (ano >= 2027) setAliquotas(textoAliquotas(ano)); }}>{ANOS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
          {anoReforma >= 2027 ? <fieldset className="space-y-2"><legend className="text-xs font-medium text-slate-600">Alíquotas de {anoReforma} (pontos percentuais; editáveis)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label htmlFor="a-cbs" className={rotulo}>CBS (%)</label><input id="a-cbs" className={campo} inputMode="decimal" value={aliquotas.cbs} onChange={e => setAliquotas({ ...aliquotas, cbs: e.target.value })} /></div>
              <div><label htmlFor="a-uf" className={rotulo}>IBS estadual (%)</label><input id="a-uf" className={campo} inputMode="decimal" value={aliquotas.ibsUf} onChange={e => setAliquotas({ ...aliquotas, ibsUf: e.target.value })} /></div>
              <div><label htmlFor="a-mun" className={rotulo}>IBS municipal (%)</label><input id="a-mun" className={campo} inputMode="decimal" value={aliquotas.ibsMun} onChange={e => setAliquotas({ ...aliquotas, ibsMun: e.target.value })} /></div>
            </div>
            <p className="text-xs text-slate-600">Cálculo simulado: valores padrão são {ROTULO_ESTIMATIVA}.</p></fieldset>
            : <p className="text-xs text-slate-600">2026 é ano de teste: CBS 0,90% e IBS 0,10% (banco oficial da Receita), destacados na nota sem custo.</p>}
        </div>}
        {modo === 'simples' && <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div><label htmlFor="s-anexo" className={rotulo}>Anexo</label><select id="s-anexo" className={campo} value={simples.anexo} onChange={e => setSimples({ ...simples, anexo: e.target.value as Anexo })}><option value="III">III</option><option value="IV">IV (vigilância, limpeza)</option><option value="V">V (Fator R)</option></select></div>
            <div><label htmlFor="s-rbt12" className={rotulo}>RBT12 (R$)</label><input id="s-rbt12" className={campo} inputMode="decimal" value={simples.rbt12} onChange={e => setSimples({ ...simples, rbt12: e.target.value })} placeholder="ex.: 500000" /></div>
            <div><label htmlFor="s-folha" className={rotulo}>Folha 12 meses (R$)</label><input id="s-folha" className={campo} inputMode="decimal" value={simples.folha12} onChange={e => setSimples({ ...simples, folha12: e.target.value })} placeholder="opcional" /></div>
            <div><label htmlFor="s-ano" className={rotulo}>Ano</label><select id="s-ano" className={campo} value={simples.ano} onChange={e => setSimples({ ...simples, ano: Number(e.target.value) })}>{ANOS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="s-pcbs" className={rotulo}>CBS efetiva do PGDAS-D (%)</label><input id="s-pcbs" className={campo} inputMode="decimal" value={simples.pCBS} onChange={e => setSimples({ ...simples, pCBS: e.target.value })} placeholder="opcional" /></div>
            <div><label htmlFor="s-pibs" className={rotulo}>IBS efetivo do PGDAS-D (%)</label><input id="s-pibs" className={campo} inputMode="decimal" value={simples.pIBS} onChange={e => setSimples({ ...simples, pIBS: e.target.value })} placeholder="opcional" /></div>
          </div>
          <p className="text-xs text-slate-600">A RBT12 e a folha são da empresa prestadora. No Anexo V, folha de 28% ou mais da RBT12 passa para o Anexo III (Fator R). A cessão de mão de obra só é permitida no Simples nas atividades do Anexo IV.</p>
        </div>}
        {pendente && <p role="status" className="border-l-2 border-amber-400 pl-3 text-xs text-slate-700">{pendente} Enquanto isso, o resultado usa as regras atuais.</p>}
      </section>
    </div>

    <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto" aria-label="Resultado do orçamento"><div className="space-y-4 rounded-lg border border-slate-200 border-t-2 border-t-slate-800 bg-surface p-5">
      <p role="note" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Tabela de referência de {catalogo.referencia.extraidoEm.split('-').reverse().join('/')}. Salário mínimo usado na insalubridade: {brl(catalogo.salarioMinimo)}. Confira se os valores estão vigentes antes de usar.</p>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valor mensal estimado</p>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900" aria-live="polite">{resultado ? brl(resultado.valorContrato) : '—'}</p>
      {resultado && <>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Em 12 meses</dt><dd className="font-medium">{brl(resultado.valorAnual)}</dd></div>
          <div><dt className="text-xs text-slate-500">Por funcionário (médio)</dt><dd className="font-medium">{brl(resultado.precoMedioFuncionario)}</dd></div>
          <div><dt className="text-xs text-slate-500">Funcionários</dt><dd className="font-medium">{resultado.funcionarios}</dd></div>
          {resultado.precoPorMetro !== null && <div><dt className="text-xs text-slate-500">Por m²</dt><dd className="font-medium">{brl(resultado.precoPorMetro)}</dd></div>}</dl>
        <ul className="space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">{resultado.postos.map((p, i) => <li key={i} className="flex justify-between gap-2"><span>{p.quantidade}× {p.funcao} ({p.turno})</span><span className="font-medium text-slate-800">{brl(p.valorMensal)}</span></li>)}</ul>
        <ul className="space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">{([['Salários e adicionais', resultado.composicao.folha], ['Encargos sociais', resultado.composicao.encargos], ['Benefícios', resultado.composicao.beneficios], ['PCMSO e PPR', resultado.composicao.outros], ['Uniformes, EPIs e insumos', resultado.composicao.materiais], ['Tributos, BDI e lucro', resultado.composicao.tributosMargem]] as [string, number][]).map(([nome, valor]) =>
          <li key={nome} className="flex justify-between gap-2"><span>{nome}</span><span>{(valor / resultado.valorContrato * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></li>)}</ul></>}
      {calculo?.tributacao && <div className="space-y-2 border-t border-slate-200 pt-3 text-xs text-slate-600" role="group" aria-label="Tributação escolhida">
        <p className="font-semibold uppercase tracking-wider text-slate-500">{calculo.tributacao.rotulo}</p>
        {calculo.tributacao.nota && <dl className="grid grid-cols-2 gap-x-3 gap-y-1"><dt>Valor do serviço</dt><dd className="text-right font-medium text-slate-800">{brl(calculo.tributacao.nota.valorServico)}</dd>
          <dt>CBS{calculo.tributacao.nota.informativo ? ' (sem custo)' : ''}</dt><dd className="text-right font-medium text-slate-800">{brl(calculo.tributacao.nota.cbs)}</dd>
          <dt>IBS{calculo.tributacao.nota.informativo ? ' (sem custo)' : ''}</dt><dd className="text-right font-medium text-slate-800">{brl(calculo.tributacao.nota.ibs)}</dd>
          <dt className="font-semibold text-slate-800">Total da nota</dt><dd className="text-right font-semibold text-slate-900">{brl(calculo.tributacao.nota.totalNota)}</dd></dl>}
        {calculo.tributacao.das && <dl className="grid grid-cols-2 gap-x-3 gap-y-1"><dt>Alíquota efetiva do DAS</dt><dd className="text-right font-medium text-slate-800">{pct(calculo.tributacao.das.aliquotaEfetiva, 4)}</dd>
          <dt>DAS mensal</dt><dd className="text-right font-medium text-slate-800">{brl(calculo.tributacao.das.valorDas ?? 0)}</dd></dl>}
        {comparacao && <table className="w-full text-left"><caption className="sr-only">Comparação entre as regras atuais e a tributação escolhida</caption>
          <thead><tr><th scope="col" className="pb-1 font-medium text-slate-500">Valor mensal</th><th scope="col" className="pb-1 text-right font-medium text-slate-500">Valor</th></tr></thead>
          <tbody><tr><th scope="row" className="font-normal">Regras atuais</th><td className="text-right">{brl(comparacao.valorContrato)}</td></tr>
            <tr><th scope="row" className="font-normal">{calculo.tributacao.modo === 'reforma' ? 'Reforma (valor do serviço)' : 'Simples Nacional'}</th><td className="text-right">{brl(calculo.valorContrato)}</td></tr>
            {calculo.tributacao.nota && <tr><th scope="row" className="font-normal">Reforma (total da nota)</th><td className="text-right">{brl(calculo.tributacao.nota.totalNota)}</td></tr>}
            <tr><th scope="row" className="font-semibold text-slate-800">Diferença no serviço</th><td className="text-right font-semibold text-slate-800">{brl(calculo.valorContrato - comparacao.valorContrato)}</td></tr></tbody></table>}
        <ul className="list-disc space-y-1 pl-4">{calculo.tributacao.avisos.slice(0, 3).map(a => <li key={a}>{a}</li>)}</ul>
        <details><summary className="cursor-pointer font-medium text-slate-700">Memória de cálculo</summary><ul className="mt-1 list-disc space-y-1 pl-4">{calculo.tributacao.memoria.map((m, i) => <li key={i}>{m}</li>)}{calculo.tributacao.avisos.slice(3).map(a => <li key={a}>{a}</li>)}</ul></details>
      </div>}
      {repetido && <p role="alert" className="border-l-2 border-amber-400 pl-3 text-xs text-slate-700">Há postos repetidos (mesma função, turno e adicionais). Some as quantidades em um só posto para gerar o PDF.</p>}
      {erro && <p role="alert" className="border-l-2 border-amber-400 pl-3 text-xs text-slate-700">{erro}</p>}
      <div className="flex flex-col gap-2">
        <Button type="button" disabled={!resultado || repetido || baixando !== ''} onClick={() => void baixar('orcamento')}>{baixando === 'orcamento' ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <Download size={16} aria-hidden />} Baixar orçamento (PDF)</Button>
        <Button type="button" variant="outline" disabled={!resultado || repetido || baixando !== ''} onClick={() => void baixar('custo')}>{baixando === 'custo' ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <FileText size={16} aria-hidden />} Relatório de custo detalhado (PDF)</Button>
      </div>
      <p className="text-xs text-slate-500">Estimativa com base em tabela de referência (posição de {catalogo.referencia.extraidoEm.split('-').reverse().join('/')}). Confirme a convenção coletiva vigente da categoria antes de contratar. Encargos: {(catalogo.encargos * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% sobre a folha.</p>
    </div></aside>
  </div>;
}
