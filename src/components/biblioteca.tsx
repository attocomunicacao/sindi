import Link from 'next/link';
import { ArrowUpRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Item, Parte } from '@/lib/biblioteca/consulta';
import { Pendente } from '@/components/pendente';

export const numero = (n: number) => n.toLocaleString('pt-BR');
export function data(valor?: string, comHora = false) {
  if (!valor) return '—';
  const d = new Date(valor); if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}) });
}
/** Endereço com parâmetros de consulta; valores vazios são omitidos. */
export function endereco(base: string, parametros: Record<string, string | number | undefined>) {
  const q = new URLSearchParams(); for (const [k, v] of Object.entries(parametros)) if (v !== undefined && v !== '' && !(k === 'pagina' && Number(v) <= 1)) q.set(k, String(v));
  const texto = q.toString(); return texto ? `${base}?${texto}` : base;
}

export function Migalhas({ itens }: { itens: { rotulo: string; href?: string }[] }) {
  return <nav aria-label="Você está em" className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
    {itens.map((item, i) => <span key={item.rotulo} className="flex items-center gap-1.5">
      {i > 0 && <ChevronRight size={14} aria-hidden className="text-slate-400" />}
      {item.href ? <Link href={item.href} className="hover:text-slate-900 hover:underline">{item.rotulo}<Pendente /></Link> : <span aria-current="page" className="text-slate-800">{item.rotulo}</span>}
    </span>)}
  </nav>;
}

export function FormBusca({ acao, valor, escondidos = {}, placeholder, rotulo = 'Buscar na biblioteca', tamanho = 'grande' }: { acao: string; valor?: string; escondidos?: Record<string, string | undefined>; placeholder: string; rotulo?: string; tamanho?: 'grande' | 'compacto' }) {
  const grande = tamanho === 'grande';
  return <form action={acao} method="get" role="search" className={`flex w-full gap-2 ${grande ? 'max-w-2xl' : 'max-w-md'}`}>
    {Object.entries(escondidos).map(([nome, v]) => v ? <input key={nome} type="hidden" name={nome} value={v} /> : null)}
    <label className="relative flex-1">
      <span className="sr-only">{rotulo}</span>
      <Search size={grande ? 18 : 16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input name="q" defaultValue={valor} maxLength={120} autoComplete="off" placeholder={placeholder} className={`w-full rounded-lg border border-slate-300 bg-surface pl-10 pr-3 text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-amber-400 ${grande ? 'h-12 text-base' : 'h-10 text-sm'}`} />
    </label>
    <button type="submit" className={`rounded-lg bg-primary px-5 font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${grande ? 'h-12 text-base' : 'h-10 text-sm'}`}>Buscar</button>
  </form>;
}

export function Etiqueta({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'destaque' }) {
  return <span className={`inline-flex items-center border-l-2 pl-2 text-xs font-medium uppercase tracking-wider ${tom === 'destaque' ? 'border-amber-400 text-slate-800' : 'border-slate-300 text-slate-500'}`}>{children}</span>;
}

/** Filtro em linha: texto com sublinhado dourado quando ativo, sem botões arredondados. */
export function Filtro({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={ativo ? 'true' : undefined} className={`border-b-2 pb-0.5 text-sm hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400 ${ativo ? 'border-amber-400 font-medium text-slate-900' : 'border-transparent text-slate-500'}`}>{children}<Pendente /></Link>;
}

export function CartaoDoItem({ item, rotuloEstante, trecho }: { item: Item; rotuloEstante?: string; trecho?: Parte[] }) {
  return <li className="group py-5">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {rotuloEstante && <Etiqueta tom="destaque">{rotuloEstante}</Etiqueta>}
      {item.etiquetas.map(e => <Etiqueta key={e}>{e}</Etiqueta>)}
    </div>
    <h3 className="mt-2 text-base font-semibold leading-snug text-slate-900"><Link href={`/base/documento/${item.id}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-amber-400">{item.titulo}<Pendente /></Link></h3>
    <p className="mt-1 text-xs text-slate-500">{item.origem}{item.publicado ? ` · publicado em ${data(item.publicado)}` : ''} · coletado em {data(item.coletado)}</p>
    {trecho?.length ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{trecho.map((p, i) => p.destaque ? <mark key={i} className="bg-amber-200 px-0.5 text-slate-900">{p.texto}</mark> : <span key={i}>{p.texto}</span>)}</p>
      : item.resumo && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.resumo}</p>}
    <div className="mt-3 flex flex-wrap gap-5 text-sm">
      <Link href={`/base/documento/${item.id}`} className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4 hover:decoration-slate-900">Ler<Pendente /></Link>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900">Fonte oficial <ArrowUpRight size={14} aria-hidden /></a>
    </div>
  </li>;
}

export function Paginacao({ pagina, paginas, base, parametros }: { pagina: number; paginas: number; base: string; parametros: Record<string, string | number | undefined> }) {
  if (paginas <= 1) return null;
  const ir = (p: number) => endereco(base, { ...parametros, pagina: p });
  const classe = 'inline-flex h-9 pointer-coarse:h-11 items-center gap-1 rounded-lg border border-slate-300 bg-surface px-3 text-sm text-slate-700 hover:bg-slate-100';
  return <nav aria-label="Páginas" className="mt-6 flex items-center justify-between gap-3">
    {pagina > 1 ? <Link href={ir(pagina - 1)} rel="prev" className={classe}><ChevronLeft size={16} aria-hidden /> Anterior<Pendente /></Link> : <span />}
    <span className="text-sm text-slate-500">Página {pagina} de {paginas}</span>
    {pagina < paginas ? <Link href={ir(pagina + 1)} rel="next" className={classe}>Próxima <ChevronRight size={16} aria-hidden /><Pendente /></Link> : <span />}
  </nav>;
}
