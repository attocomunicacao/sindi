import type { ReactNode } from 'react';
import { linkSeguro } from '@/lib/base/url-segura';
import type { Painel, NoticiaDoPainel } from '@/lib/dados/painel';
import { CLASSE_CARTAO } from '@/componentes/ui/cartao';
import { NOMES_DAS_FONTES, dataCurta, dataEHora } from '@/componentes/painel/formatacao';

const CLASSE_DA_LISTA = `divide-y divide-slate-200 ${CLASSE_CARTAO}`;

function ItemDeNoticia({ noticia, legenda }: { noticia: NoticiaDoPainel; legenda: string }) {
  return <li className="p-4">
    <a href={linkSeguro(noticia.url)} target="_blank" rel="noreferrer" className="hover:underline">{noticia.title}</a>
    <p className="mt-1 text-xs text-slate-500">{legenda}</p>
  </li>;
}

function ListaVazia({ children }: { children: ReactNode }) {
  return <li className="p-4 text-sm text-slate-500">{children}</li>;
}

/** Notícias e artigos do sindicato (SINDEPRESTEM). */
export function NoticiasDoSindicato({ sindicato }: { sindicato: Painel['sindicato'] }) {
  const legenda = (n: NoticiaDoPainel) => dataCurta(n.publishedAt);
  return <section aria-labelledby="sindicato">
    <h2 id="sindicato" className="mb-3 text-lg font-semibold">Notícias do SINDEPRESTEM</h2>
    <ul className={CLASSE_DA_LISTA}>
      {sindicato.noticias.length === 0 ? <ListaVazia>Nenhuma notícia recente.</ListaVazia> : sindicato.noticias.map(n => <ItemDeNoticia key={n.url} noticia={n} legenda={legenda(n)} />)}
    </ul>
    {sindicato.artigos.length > 0 && <>
      <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-600">Artigos recentes</h3>
      <ul className={CLASSE_DA_LISTA}>{sindicato.artigos.map(n => <ItemDeNoticia key={n.url} noticia={n} legenda={legenda(n)} />)}</ul>
    </>}
  </section>;
}

/** Projetos de lei em pauta no Congresso, com a última movimentação. */
export function ProjetosEmPauta({ projetos }: { projetos: Painel['bills'] }) {
  return <section aria-labelledby="legislativo">
    <h2 id="legislativo" className="mb-3 text-lg font-semibold">Projetos em pauta no Congresso</h2>
    <ul className={CLASSE_DA_LISTA}>
      {projetos.length === 0 ? <ListaVazia>Nenhum projeto em pauta no momento.</ListaVazia> : projetos.map(projeto => <li key={projeto.url} className="p-4">
        <a href={linkSeguro(projeto.url)} target="_blank" rel="noreferrer" className="font-medium hover:underline">{projeto.title} <span className="font-normal text-slate-500">· {NOMES_DAS_FONTES[projeto.source]}</span></a>
        <p className="mt-1 text-sm text-slate-600">{projeto.summary}</p>
        <p className="mt-1 text-xs text-slate-500">{projeto.situacao ? `${projeto.situacao} · ` : ''}Última movimentação: {dataCurta(projeto.movedAt)}</p>
      </li>)}
    </ul>
  </section>;
}

/** Notícias das fontes oficiais (TST, IBGE, Ministério do Trabalho). */
export function NoticiasDasFontes({ noticias }: { noticias: Painel['news'] }) {
  return <section aria-labelledby="noticias">
    <h2 id="noticias" className="mb-3 text-lg font-semibold">Notícias das fontes</h2>
    <ul className={CLASSE_DA_LISTA}>
      {noticias.length === 0 ? <ListaVazia>Nenhuma notícia recente das fontes.</ListaVazia>
        : noticias.map(n => <ItemDeNoticia key={n.url} noticia={n} legenda={`${NOMES_DAS_FONTES[n.source] ?? n.source} · ${dataCurta(n.publishedAt)}`} />)}
    </ul>
  </section>;
}

function situacaoDaFonte(fonte: Painel['sources'][number]) {
  if (fonte.status === 'ok') return `atualizado ${dataEHora(fonte.lastOk)}`;
  const falhas = fonte.failures ?? 1;
  return `${falhas > 1 ? `${fonte.failures} falhas seguidas` : 'falha na última coleta'} (último sucesso ${dataEHora(fonte.lastOk)})`;
}

/** Situação da última coleta de cada fonte. */
export function SituacaoDasFontes({ fontes }: { fontes: Painel['sources'] }) {
  return <section aria-labelledby="fontes">
    <h2 id="fontes" className="mb-3 text-lg font-semibold">Situação das fontes</h2>
    <ul className="grid gap-2 text-sm sm:grid-cols-2">{fontes.map(f => <li key={f.source} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 rounded-lg bg-slate-100 px-3 py-2">
      <span>{NOMES_DAS_FONTES[f.source] ?? f.source}</span>
      <span className={`text-right ${f.status === 'ok' ? 'text-slate-600' : 'text-amber-800'}`}>{situacaoDaFonte(f)}</span>
    </li>)}</ul>
  </section>;
}
