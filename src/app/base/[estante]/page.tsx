import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { CartaoDoItem, Etiqueta, Filtro, FormBusca, Migalhas, Paginacao, data, endereco, numero } from '@/components/biblioteca';
import { estantePorId } from '@/lib/biblioteca/estantes';
import { cerebroPorArquivo, indicadores, listarEstante } from '@/lib/biblioteca/consulta';
import { Pendente } from '@/components/pendente';

type Consulta = Record<string, string | string[] | undefined>;
const um = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 120) || undefined;

export async function generateMetadata({ params }: { params: Promise<{ estante: string }> }) {
  const estante = estantePorId((await params).estante);
  return { title: estante ? `${estante.nome} | Biblioteca da SINDI` : 'Página não encontrada | SINDI', description: estante?.descricao };
}

export default async function EstantePage({ params, searchParams }: { params: Promise<{ estante: string }>; searchParams: Promise<Consulta> }) {
  const estante = estantePorId((await params).estante); if (!estante) notFound();
  const consulta = await searchParams;
  const q = um(consulta.q); const pagina = Number(um(consulta.pagina)) || 1;
  const facetasAtivas = Object.fromEntries(estante.facetas.map(f => [f.id, um(consulta[f.id])]).filter(([, v]) => v)) as Record<string, string>;
  const rotuloUnidade = estante.especial === 'cerebro' ? 'volumes' : estante.especial === 'indicadores' ? 'indicadores' : 'documentos';
  return <>
    <main className="anim-rise mx-auto max-w-6xl gutter py-10">
      <Migalhas itens={[{ rotulo: 'Biblioteca', href: '/base' }, { rotulo: estante.nome }]} />
      <header className="mt-6">
        <span className="block h-1 w-10 rounded-full bg-amber-400" aria-hidden />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{estante.nome}</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">{estante.descricao}</p>
      </header>
      {estante.especial === 'cerebro' ? <Cerebro q={q} /> : estante.especial === 'indicadores' ? <Indicadores /> : <Documentos estanteId={estante.id} q={q} pagina={pagina} facetasAtivas={facetasAtivas} rotuloUnidade={rotuloUnidade} />}
    </main>
  </>;
}

function Documentos({ estanteId, q, pagina, facetasAtivas, rotuloUnidade }: { estanteId: string; q?: string; pagina: number; facetasAtivas: Record<string, string>; rotuloUnidade: string }) {
  const estante = estantePorId(estanteId)!;
  const lista = listarEstante(estante, { q, facetas: facetasAtivas, pagina });
  const base = `/base/${estante.id}`; const comum = { q, ...facetasAtivas };
  return <>
    <div className="mt-6"><FormBusca acao={base} valor={q} escondidos={facetasAtivas} placeholder={`Buscar em ${estante.nome.toLowerCase()}`} rotulo={`Buscar em ${estante.nome}`} tamanho="compacto" /></div>
    {lista.facetas.map(faceta => <div key={faceta.id} className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
      <p className="w-full text-xs font-semibold uppercase tracking-wider text-slate-500 sm:w-auto">{faceta.rotulo}</p>
      <Filtro href={endereco(base, { ...comum, [faceta.id]: undefined })} ativo={!facetasAtivas[faceta.id]}>Todos</Filtro>
      {faceta.opcoes.map(o => <Filtro key={o.valor} href={endereco(base, { ...comum, [faceta.id]: o.valor })} ativo={facetasAtivas[faceta.id] === o.valor}>{o.valor} <span className="text-slate-500">({numero(o.n)})</span></Filtro>)}
    </div>)}
    <p className="mt-6 text-sm text-slate-500" aria-live="polite">{numero(lista.total)} {lista.total === 1 ? rotuloUnidade.replace(/s$/, '') : rotuloUnidade}{q || Object.keys(facetasAtivas).length ? ' com os filtros escolhidos' : ''}.</p>
    {lista.itens.length ? <ul className="mt-3 divide-y divide-slate-200 border-t-2 border-slate-800">{lista.itens.map(item => <CartaoDoItem key={item.id} item={item} />)}</ul>
      : <p className="mt-3 border-l-2 border-amber-400 pl-3 text-sm text-slate-600">{q || Object.keys(facetasAtivas).length ? <>Nada encontrado com estes filtros. <Link href={base} className="underline">Limpar filtros<Pendente /></Link>.</> : 'Esta estante ainda não tem documentos coletados neste ambiente.'}</p>}
    <Paginacao pagina={lista.pagina} paginas={lista.paginas} base={base} parametros={comum} />
  </>;
}

function Indicadores() {
  const lista = indicadores();
  const formatar = (valor: number, unidade: string) => valor.toLocaleString('pt-BR', { maximumFractionDigits: /%/.test(unidade) ? 2 : 0 });
  return lista.length ? <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{lista.map(i => <li key={i.id} className="rounded-2xl border border-slate-200 bg-surface p-5">
    <p className="text-xs text-slate-500">{i.group}</p>
    <h2 className="mt-1 text-sm font-medium leading-snug text-slate-800">{i.label}</h2>
    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{formatar(i.value, i.unit)}<span className="ml-1.5 text-sm font-normal text-slate-500">{i.unit}</span></p>
    <p className="mt-2 text-xs text-slate-500">Referência {i.period} · coletado em {data(i.fetchedAt)}</p>
    <a href={i.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">Fonte oficial <ArrowUpRight size={14} aria-hidden /></a>
  </li>)}</ul> : <p className="mt-8 border-l-2 border-amber-400 pl-3 text-sm text-slate-600">Os indicadores ainda não foram coletados neste ambiente.</p>;
}

function Cerebro({ q }: { q?: string }) {
  const termo = q?.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const volumes = cerebroPorArquivo().map(v => ({ ...v, secoes: termo ? v.secoes.filter(s => `${s.secao} ${s.texto}`.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(termo)) : v.secoes })).filter(v => v.secoes.length);
  return <>
    <div className="mt-6"><FormBusca acao="/base/cerebro" valor={q} placeholder="Buscar nas seções escritas pela equipe" rotulo="Buscar no conhecimento da SINDI" tamanho="compacto" /></div>
    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-500">Cada volume é um arquivo da pasta <code>cerebro/</code>; cada seção é um capítulo que a SINDI pode consultar. Os volumes “gerados” são resumos recriados a partir dos documentos coletados. As instruções internas da assistente não são exibidas.</p>
    {volumes.length ? <div className="mt-6 divide-y divide-slate-200 border-y-2 border-slate-800">{volumes.map(v => <details key={v.arquivo} className="group" open={Boolean(termo)}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 py-4">
        <span className="text-base font-semibold text-slate-900">{v.titulo}</span>
        <Etiqueta tom={v.tipo === 'curado' ? 'destaque' : 'neutro'}>{v.tipo === 'curado' ? 'escrito pela equipe' : 'gerado dos documentos'}</Etiqueta>
        <span className="text-xs text-slate-500">{v.secoes.length} {v.secoes.length === 1 ? 'seção' : 'seções'}{v.atualizado ? ` · ${data(v.atualizado)}` : ''}</span>
      </summary>
      <div className="space-y-5 border-t border-slate-200 py-5">
        {v.fonte && <a href={v.fonte} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">Fonte do volume <ArrowUpRight size={14} aria-hidden /></a>}
        {v.secoes.map(s => <section key={s.secao}>
          <h2 className="text-sm font-semibold text-slate-900">{s.secao}</h2>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{s.texto.length > 1400 ? `${s.texto.slice(0, 1400).replace(/\s+\S*$/, '')} …` : s.texto}</p>
        </section>)}
      </div>
    </details>)}</div> : <p className="mt-6 border-l-2 border-amber-400 pl-3 text-sm text-slate-600">Nenhuma seção encontrada. <Link href="/base/cerebro" className="underline">Limpar a busca<Pendente /></Link>.</p>}
  </>;
}
