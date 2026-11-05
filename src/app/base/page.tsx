import Link from 'next/link';
import { CartaoDoItem, Filtro, FormBusca, data, endereco, numero } from '@/components/biblioteca';
import { ALAS, estantePorId, type Ala } from '@/lib/biblioteca/estantes';
import { buscarNaBiblioteca, resumoDaBiblioteca } from '@/lib/biblioteca/consulta';
import { knowledgeStatus } from '@/lib/knowledge/status';
import { Pendente } from '@/components/pendente';

export const metadata = { title: 'Biblioteca | SINDI', description: 'Acervo que a SINDI consulta: convenções, jurídico, normas, notícias, indicadores e o conhecimento escrito pela equipe.' };
type Consulta = { q?: string | string[]; estante?: string | string[] };
const texto = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 120) || undefined;

const PASSOS = [
  ['Compreensão', 'Identifica o assunto e o contexto da conversa, e recusa o que foge do setor.'],
  ['Consulta', 'Busca por palavras e por significado nas estantes e seleciona os trechos pertinentes.'],
  ['Redação', 'O modelo explica, com palavras próprias, o que os trechos dizem para o caso apresentado.'],
  ['Verificação', 'Valores, contatos e leis ausentes das fontes derrubam a resposta; as fontes usadas são citadas.'],
] as const;

export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<Consulta> }) {
  const parametros = await searchParams;
  const q = texto(parametros.q); const estanteFiltro = texto(parametros.estante);
  return <>
    <main className="anim-rise">{q ? <Resultados q={q} estanteId={estanteFiltro} /> : <Inicio />}</main>
  </>;
}

const Titulo = ({ children }: { children: React.ReactNode }) => <><span className="block h-1 w-10 rounded-full bg-amber-400" aria-hidden /><h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{children}</h1></>;

async function Inicio() {
  const resumo = resumoDaBiblioteca(); const status = await knowledgeStatus();
  const alas = (Object.keys(ALAS) as Ala[]).map(ala => ({ ala, estantes: resumo.estantes.filter(e => e.estante.ala === ala) }));
  let ordem = 0;
  return <div className="mx-auto max-w-6xl gutter py-12 sm:py-16">
    <header>
      <Titulo>Biblioteca</Titulo>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Acervo consultado pela SINDI antes de cada resposta, com a fonte sempre indicada.</p>
      <div className="mt-8"><FormBusca acao="/base" placeholder="Buscar por tema, norma, categoria ou palavra" /></div>
      <p className="mt-5 text-sm text-slate-500">{numero(resumo.documentos)} documentos · {resumo.estantes.length} estantes · última coleta em {data(resumo.atualizado)}</p>
      {!resumo.disponivel && <p role="status" className="mt-5 max-w-2xl border-l-2 border-amber-400 pl-3 text-sm text-slate-600">A coleta de documentos ainda não está disponível neste ambiente. Apenas o conhecimento escrito pela equipe aparece nas estantes.</p>}
    </header>

    <div className="mt-14 space-y-12">
      {alas.map(({ ala, estantes }) => <section key={ala} aria-labelledby={`ala-${ala}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b-2 border-slate-800 pb-2">
          <h2 id={`ala-${ala}`} className="text-lg font-semibold text-slate-900">{ALAS[ala].nome}</h2>
          <p className="text-sm text-slate-500">{ALAS[ala].descricao}</p>
        </div>
        <ul className="divide-y divide-slate-200">
          {estantes.map(({ estante, total, atualizado }) => { ordem += 1; return <li key={estante.id}>
            <Link href={`/base/${estante.id}`} className="group grid grid-cols-[2rem_1fr] items-baseline gap-x-4 py-4 xs:grid-cols-[2rem_1fr_auto] hover:bg-slate-100/60 focus-visible:outline-2 focus-visible:outline-amber-400 sm:grid-cols-[2.5rem_1fr_auto]">
              <span className="text-sm tabular-nums text-slate-500">{String(ordem).padStart(2, '0')}</span>
              <span className="min-w-0">
                <span className="block text-base font-medium text-slate-900 group-hover:underline group-hover:decoration-amber-400 group-hover:decoration-2 group-hover:underline-offset-4">{estante.nome}</span>
                <span className="mt-0.5 block text-sm leading-6 text-slate-500">{estante.descricao}</span>
              </span>
              <span className="col-start-2 mt-1 flex items-baseline gap-1.5 text-sm tabular-nums text-slate-500 xs:col-start-auto xs:mt-0 xs:block xs:text-right"><span className="block font-semibold text-slate-900">{numero(total)}</span><span className="block text-xs">{estante.especial === 'cerebro' ? (total === 1 ? 'seção' : 'seções') : estante.especial === 'indicadores' ? 'indicadores' : (total === 1 ? 'documento' : 'documentos')}{atualizado ? ` · ${data(atualizado)}` : ''}</span></span>
            <Pendente /></Link>
          </li>; })}
        </ul>
      </section>)}
    </div>

    <section aria-labelledby="como-funciona" className="mt-16">
      <div className="border-b-2 border-slate-800 pb-2"><h2 id="como-funciona" className="text-lg font-semibold text-slate-900">Como a SINDI usa o acervo</h2></div>
      <ol className="divide-y divide-slate-200">
        {PASSOS.map(([titulo, descricao], i) => <li key={titulo} className="grid grid-cols-[2rem_1fr] gap-x-4 py-4 sm:grid-cols-[2.5rem_9rem_1fr]">
          <span className="text-sm tabular-nums text-slate-500">{String(i + 1).padStart(2, '0')}</span>
          <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
          <p className="col-start-2 text-sm leading-6 text-slate-600 sm:col-start-auto">{descricao}</p>
        </li>)}
      </ol>
      <p className="mt-4 text-sm leading-6 text-slate-500">O acervo não é parecer jurídico nem determina a vigência de normas. PDFs digitalizados sem texto ficam listados, mas sem conteúdo para consulta pela SINDI.</p>
    </section>

    <section aria-labelledby="coleta" className="mt-12">
      <details className="group border-y border-slate-200 py-4">
        <summary id="coleta" className="cursor-pointer text-sm font-semibold text-slate-900 marker:text-slate-400">Situação da coleta do site do SINDEPRESTEM</summary>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
          {status.available ? <>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[['Documentos do site', status.documents], ['URLs verificadas', status.checked], ['URLs no sitemap', status.discovered], ['Pendências', status.failureCount]].map(([rotulo, valor]) => <div key={String(rotulo)}><dt className="text-xs text-slate-500">{rotulo}</dt><dd className="text-xl font-semibold tabular-nums text-slate-900">{numero(Number(valor ?? 0))}</dd></div>)}
            </dl>
            <p>Última varredura iniciada em {data(status.startedAt, true)}; conclusão em {data(status.finishedAt, true)}. {status.phase === 'running' ? `Varredura em andamento (último sinal ${data(status.heartbeatAt, true)}).` : 'Varredura encerrada.'}</p>
            <p>{status.cloudConfigured ? `${numero(status.uploaded ?? 0)} documentos confirmados no Supabase nesta varredura.` : 'Espelho local ativo; o envio ao Supabase depende da chave de escrita no coletor.'} {numero(status.externalCount ?? 0)} links externos foram identificados e não contam como textos lidos.</p>
            {status.incomplete && <p>Esta coleta ainda está incompleta; falhas e conteúdos não extraídos ficam registrados para revisão.</p>}
          </> : <p>A primeira coleta do site ainda não gerou relatório.</p>}
          <p>O coletor consulta os sitemaps a cada 15 minutos; notícias antigas são revisadas diariamente ou quando o sitemap indica mudança. Isso não é atualização instantânea.</p>
        </div>
      </details>
    </section>
  </div>;
}

async function Resultados({ q, estanteId }: { q: string; estanteId?: string }) {
  const filtro = estanteId && estantePorId(estanteId) ? estanteId : undefined;
  const resultado = buscarNaBiblioteca(q, filtro);
  const total = resultado.porEstante.reduce((s, e) => s + e.n, 0);
  return <div className="mx-auto max-w-6xl gutter py-10">
    <nav aria-label="Você está em" className="text-sm text-slate-500"><Link href="/base" className="hover:text-slate-900 hover:underline">Biblioteca<Pendente /></Link> <span aria-hidden>/</span> <span className="text-slate-800">Busca</span></nav>
    <h1 className="mt-4 text-2xl font-semibold text-slate-900">Resultados para “{q}”</h1>
    <div className="mt-5"><FormBusca acao="/base" valor={q} escondidos={{ estante: filtro }} placeholder="Refinar a busca" tamanho="compacto" /></div>

    {resultado.porEstante.length > 0 && <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2" aria-label="Filtrar por estante">
      <Filtro href={endereco('/base', { q })} ativo={!filtro}>Todas ({total})</Filtro>
      {resultado.porEstante.map(({ id, n }) => <Filtro key={id} href={endereco('/base', { q, estante: id })} ativo={filtro === id}>{estantePorId(id)?.nome} ({n})</Filtro>)}
    </div>}

    {resultado.cerebro.length > 0 && !filtro && <section className="mt-10" aria-labelledby="da-sindi">
      <h2 id="da-sindi" className="border-b-2 border-slate-800 pb-2 text-sm font-semibold uppercase tracking-wider text-slate-900">Conhecimento escrito pela equipe</h2>
      <ul className="divide-y divide-slate-200">{resultado.cerebro.slice(0, 4).map(c => <li key={`${c.arquivo}-${c.secao}`} className="py-5">
        <p className="text-xs text-slate-500">{c.titulo}</p>
        <h3 className="mt-0.5 text-base font-semibold text-slate-900">{c.secao}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{c.texto}{c.texto.length >= 420 ? ' …' : ''}</p>
        <Link href="/base/cerebro" className="mt-2 inline-block text-sm font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4">Abrir a estante<Pendente /></Link>
      </li>)}</ul>
    </section>}

    <section className="mt-10" aria-labelledby="documentos">
      <h2 id="documentos" className="border-b-2 border-slate-800 pb-2 text-sm font-semibold uppercase tracking-wider text-slate-900">Documentos</h2>
      {resultado.achados.length ? <ul className="divide-y divide-slate-200">{resultado.achados.map(a => <CartaoDoItem key={a.id} item={{ ...a, resumo: '' }} rotuloEstante={estantePorId(a.estante)?.nome} trecho={a.partes} />)}</ul>
        : <p className="py-5 text-sm text-slate-600">Nenhum documento encontrado. Tente palavras mais gerais ou <Link href="/base" className="underline">navegue pelas estantes<Pendente /></Link>.</p>}
    </section>
    <p className="mt-8 text-xs text-slate-500">A busca considera título e texto e aceita o início da palavra (por exemplo, “terceiriz”).</p>
  </div>;
}
