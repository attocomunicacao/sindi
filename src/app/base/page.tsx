import Link from 'next/link';
import { CartaoDoItem } from '@/componentes/biblioteca/cartao-do-item';
import { Filtro } from '@/componentes/biblioteca/filtro';
import { FormularioDeBusca } from '@/componentes/biblioteca/formulario-de-busca';
import { data, endereco } from '@/componentes/biblioteca/formatacao';
import { BarraDeDestaque } from '@/componentes/ui/pagina-ferramenta';
import { numeroBR } from '@/lib/base/formato';
import { estantePorId } from '@/lib/biblioteca/estantes';
import { buscarNaBiblioteca, resumoDaBiblioteca } from '@/lib/biblioteca/consulta';
import { statusDoConhecimento } from '@/lib/recuperacao/legado/status';
import { Pendente } from '@/componentes/layout/pendente';
import { ListaDeEstantes } from '@/componentes/biblioteca/lista-de-estantes';
import { PassosDaSindi } from '@/componentes/biblioteca/passos-da-sindi';
import { SituacaoDaColeta } from '@/componentes/biblioteca/situacao-da-coleta';

export const metadata = {
  title: 'Biblioteca | SINDI',
  description:
    'Acervo que a SINDI consulta: convenções, jurídico, normas, notícias, indicadores e o conhecimento escrito pela equipe.',
};
type Consulta = { q?: string | string[]; estante?: string | string[] };
const texto = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 120) || undefined;

export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<Consulta> }) {
  const parametros = await searchParams;
  const q = texto(parametros.q);
  const estanteFiltro = texto(parametros.estante);
  return <main className="anim-rise">{q ? <Resultados q={q} estanteId={estanteFiltro} /> : <Inicio />}</main>;
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BarraDeDestaque />
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{children}</h1>
    </>
  );
}

async function Inicio() {
  const resumo = resumoDaBiblioteca();
  const status = await statusDoConhecimento();
  return (
    <div className="mx-auto max-w-[120rem] gutter py-12 sm:py-16">
      <header>
        <Titulo>Biblioteca</Titulo>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Acervo consultado pela SINDI antes de cada resposta, com a fonte sempre indicada.{' '}
          {numeroBR(resumo.documentos)} documentos · {resumo.estantes.length} estantes · última coleta em{' '}
          {data(resumo.atualizado)}.
        </p>
        <div className="mt-8">
          <FormularioDeBusca acao="/base" placeholder="Buscar por tema, norma, categoria ou palavra" />
        </div>
        {!resumo.disponivel && (
          <p role="status" className="mt-5 max-w-3xl border-l-2 border-amber-400 pl-3 text-sm text-slate-600">
            A coleta de documentos ainda não está disponível neste ambiente. Apenas o conhecimento escrito pela equipe
            aparece nas estantes.
          </p>
        )}
      </header>
      <ListaDeEstantes estantes={resumo.estantes} />
      <PassosDaSindi />
      <SituacaoDaColeta status={status} />
    </div>
  );
}

async function Resultados({ q, estanteId }: { q: string; estanteId?: string }) {
  const filtro = estanteId && estantePorId(estanteId) ? estanteId : undefined;
  const resultado = buscarNaBiblioteca(q, filtro);
  const total = resultado.porEstante.reduce((s, e) => s + e.n, 0);
  return (
    <div className="mx-auto max-w-[120rem] gutter py-10">
      <nav aria-label="Você está em" className="text-sm text-slate-500">
        <Link href="/base" className="hover:text-slate-900 hover:underline">
          Biblioteca
          <Pendente />
        </Link>{' '}
        <span aria-hidden>/</span> <span className="text-slate-800">Busca</span>
      </nav>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Resultados para “{q}”</h1>
      <div className="mt-5">
        <FormularioDeBusca
          acao="/base"
          valor={q}
          escondidos={{ estante: filtro }}
          placeholder="Refinar a busca"
          tamanho="compacto"
        />
      </div>

      {resultado.porEstante.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2" aria-label="Filtrar por estante">
          <Filtro href={endereco('/base', { q })} ativo={!filtro}>
            Todas ({total})
          </Filtro>
          {resultado.porEstante.map(({ id, n }) => (
            <Filtro key={id} href={endereco('/base', { q, estante: id })} ativo={filtro === id}>
              {estantePorId(id)?.nome} ({n})
            </Filtro>
          ))}
        </div>
      )}

      {resultado.cerebro.length > 0 && !filtro && (
        <section className="mt-10" aria-labelledby="da-sindi">
          <h2
            id="da-sindi"
            className="border-b-2 border-slate-800 pb-2 text-sm font-semibold uppercase tracking-wider text-slate-900"
          >
            Conhecimento escrito pela equipe
          </h2>
          <ul className="divide-y divide-slate-200">
            {resultado.cerebro.slice(0, 4).map((c) => (
              <li key={`${c.arquivo}-${c.secao}`} className="py-5">
                <p className="text-xs text-slate-500">{c.titulo}</p>
                <h3 className="mt-0.5 text-base font-semibold text-slate-900">{c.secao}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {c.texto}
                  {c.texto.length >= 420 ? ' …' : ''}
                </p>
                <Link
                  href="/base/cerebro"
                  className="mt-2 inline-block text-sm font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4"
                >
                  Abrir a estante
                  <Pendente />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="documentos">
        <h2
          id="documentos"
          className="border-b-2 border-slate-800 pb-2 text-sm font-semibold uppercase tracking-wider text-slate-900"
        >
          Documentos
        </h2>
        {resultado.achados.length ? (
          <ul className="divide-y divide-slate-200">
            {resultado.achados.map((a) => (
              <CartaoDoItem
                key={a.id}
                item={{ ...a, resumo: '' }}
                rotuloEstante={estantePorId(a.estante)?.nome}
                trecho={a.partes}
              />
            ))}
          </ul>
        ) : (
          <p className="py-5 text-sm text-slate-600">
            Nenhum documento encontrado. Tente palavras mais gerais ou{' '}
            <Link href="/base" className="underline">
              navegue pelas estantes
              <Pendente />
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
