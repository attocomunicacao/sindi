'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calcularOrcamento, type OrcamentoEntrada } from '@/lib/orcamento/calculo';
import { catalogoPublico, type CatalogoPublico } from '@/lib/orcamento/catalogo-publico';
import { resumoDoOrcamento } from '@/lib/orcamento/resumo';

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

  const calculo = useMemo(() => {
    if (!corpo.postos.length) return null;
    try { const r = calcularOrcamento(corpo as OrcamentoEntrada); return r.postos.length ? r : null; } catch { return null; }
  }, [corpo]);
  const resultado = useMemo(() => (calculo ? resumoDoOrcamento(calculo) : null), [calculo]);
  // Dois postos idênticos são recusados pelo servidor ao gerar o PDF: avisar antes, na tela.
  const repetido = useMemo(() => { const vistos = new Set<string>(); return postos.some(p => { const k = JSON.stringify([p.funcaoId, p.turno, p.periculosidade, p.insalubridade, p.horasNoturnas]); if (vistos.has(k)) return true; vistos.add(k); return false; }); }, [postos]);

  const atualizar = (chave: number, mudanca: Partial<Posto>) => setPostos(lista => lista.map(p => p.chave === chave ? { ...p, ...mudanca } : p));
  const baixar = useCallback(async (tipo: 'orcamento' | 'custo') => {
    if (repetido) return;
    setBaixando(tipo); setErro('');
    try {
      const resposta = await fetch(`/api/orcamento/pdf?tipo=${tipo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, cliente }) });
      if (!resposta.ok) throw new Error((await resposta.json()).error || 'Não foi possível gerar o PDF.');
      const url = URL.createObjectURL(await resposta.blob());
      const link = document.createElement('a'); link.href = url; link.download = tipo === 'orcamento' ? 'orcamento-terceirizacao.pdf' : 'relatorio-de-custo.pdf'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (causa) { setErro(causa instanceof Error ? causa.message : 'Não foi possível gerar o PDF.'); } finally { setBaixando(''); }
  }, [corpo, cliente, repetido]);

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
        <div className="max-w-xs"><label htmlFor="iss" className={rotulo}>ISS do município da prestação</label>
          <select id="iss" className={campo} value={iss ?? ''} onChange={e => setIss(Number(e.target.value))}>{catalogo.iss.map(v => <option key={v} value={v}>{(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</option>)}</select></div>
        <p className="text-xs text-slate-500">PIS, COFINS, contribuição social, IRPJ, BDI e lucro seguem a tabela de referência.</p>
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
