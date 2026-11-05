import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { Etiqueta, Migalhas, data, endereco, numero } from '@/components/biblioteca';
import { estantePorId } from '@/lib/biblioteca/estantes';
import { lerDocumento } from '@/lib/biblioteca/consulta';
import { pdfPermitido } from '@/lib/biblioteca/pdf';
import { Pendente } from '@/components/pendente';

const LIMITE_INICIAL = 12000; const LIMITE_TOTAL = 200000;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const documento = lerDocumento(Number((await params).id));
  return { title: documento ? `${documento.titulo} | Biblioteca da SINDI` : 'Página não encontrada | SINDI' };
}

export default async function DocumentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ completo?: string }> }) {
  const id = Number((await params).id); const completo = (await searchParams).completo === '1';
  const documento = Number.isSafeInteger(id) ? lerDocumento(id) : undefined; if (!documento) notFound();
  const estante = estantePorId(documento.estante);
  const limite = completo ? LIMITE_TOTAL : LIMITE_INICIAL;
  const recorte = documento.texto.length > limite ? documento.texto.slice(0, limite).replace(/\s+\S*$/, '') : documento.texto;
  const paragrafos = recorte.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const cortado = recorte.length < documento.texto.length;
  const pdf = Boolean(pdfPermitido(documento.fonteOriginal));
  return <>
    <main className="anim-rise mx-auto max-w-6xl gutter py-10">
      <Migalhas itens={[{ rotulo: 'Biblioteca', href: '/base' }, ...(estante ? [{ rotulo: estante.nome, href: `/base/${estante.id}` }] : []), { rotulo: 'Documento' }]} />
      <article className="mt-5">
        <header>
          <div className="flex flex-wrap gap-x-4 gap-y-1">{estante && <Etiqueta tom="destaque">{estante.nome}</Etiqueta>}{documento.etiquetas.map(e => <Etiqueta key={e}>{e}</Etiqueta>)}</div>
          <h1 className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-3xl">{documento.titulo}</h1>
          <p className="mt-2 text-sm text-slate-500">{documento.origem}{documento.publicado ? ` · publicado em ${data(documento.publicado)}` : ''} · coletado em {data(documento.coletado, true)} · {numero(documento.tamanho)} caracteres</p>
          <a href={documento.fonteOriginal} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100">Abrir a fonte oficial <ArrowUpRight size={15} aria-hidden /></a>
        </header>
        {pdf && <iframe src={`/api/biblioteca/pdf/${documento.id}`} title={documento.titulo} className="mt-6 h-[80dvh] min-h-[min(30rem,85dvh)] w-full rounded-xl border border-slate-200 bg-surface" />}
        {pdf && paragrafos.length > 0 && <details className="mt-6 border-y border-slate-200 py-4"><summary className="cursor-pointer text-sm font-medium text-slate-900">Texto extraído (usado na busca e pela SINDI)</summary><p className="mt-2 text-xs text-slate-500">Extração automática de PDF diagramado em colunas: a ordem pode estar embaralhada. A leitura fiel é o PDF acima.</p>
          <div className="mt-4 space-y-4 text-base leading-7 text-slate-700">{paragrafos.map((p, i) => <p key={i}>{p}</p>)}</div></details>}
        {!pdf && <div className="mt-8 max-w-3xl space-y-4 text-base leading-7 text-slate-700">
          {paragrafos.length ? paragrafos.map((p, i) => <p key={i}>{p}</p>) : <p className="border-y border-slate-200 py-4 text-sm text-slate-600">Este documento não tem texto extraído (por exemplo, um PDF digitalizado como imagem). Ele está listado e aponta para a fonte, mas a SINDI não consegue consultá-lo.</p>}
        </div>}
        {!pdf && cortado && <div className="mt-6 border-y border-slate-200 py-4 text-sm text-slate-600">
          Mostrando o começo do documento ({numero(recorte.length)} de {numero(documento.tamanho)} caracteres). {documento.texto.length > LIMITE_TOTAL && completo ? `A leitura aqui vai até ${numero(LIMITE_TOTAL)} caracteres; o restante está na fonte oficial.` : ''}
          {!completo && <> <Link href={endereco(`/base/documento/${documento.id}`, { completo: '1' })} className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4">Ler mais<Pendente /></Link></>}
        </div>}
        <p className="mt-10 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">Texto extraído automaticamente da fonte indicada; tabelas e formatação de PDFs podem se perder. Consulte sempre a fonte oficial para a versão vigente: a coleta não determina a vigência jurídica dos documentos.</p>
      </article>
    </main>
  </>;
}
