import { numeroBR } from '@/lib/base/formato';
import type { statusDoConhecimento } from '@/lib/recuperacao/legado/status';
import { data } from '@/componentes/biblioteca/formatacao';

type Status = Awaited<ReturnType<typeof statusDoConhecimento>>;

/** Contadores e datas da última varredura, ou o aviso de que ainda não houve relatório. */
function RelatorioDaVarredura({ status }: { status: Status }) {
  if (!status.available) return <p>A primeira coleta do site ainda não gerou relatório.</p>;
  return (
    <>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Documentos do site', status.documents],
          ['URLs verificadas', status.checked],
          ['URLs no sitemap', status.discovered],
          ['Pendências', status.failureCount],
        ].map(([rotulo, valor]) => (
          <div key={String(rotulo)}>
            <dt className="text-xs text-slate-500">{rotulo}</dt>
            <dd className="text-xl font-semibold tabular-nums text-slate-900">{numeroBR(Number(valor ?? 0))}</dd>
          </div>
        ))}
      </dl>
      <p>
        Última varredura iniciada em {data(status.startedAt, true)}; conclusão em {data(status.finishedAt, true)}.{' '}
        {status.phase === 'running'
          ? `Varredura em andamento (último sinal ${data(status.heartbeatAt, true)}).`
          : 'Varredura encerrada.'}
      </p>
      <p>
        {status.cloudConfigured
          ? `${numeroBR(status.uploaded ?? 0)} documentos confirmados no Supabase nesta varredura.`
          : 'Espelho local ativo; o envio ao Supabase depende da chave de escrita no coletor.'}{' '}
        {numeroBR(status.externalCount ?? 0)} links externos foram identificados e não contam como textos lidos.
      </p>
      {status.incomplete && (
        <p>Esta coleta ainda está incompleta; falhas e conteúdos não extraídos ficam registrados para revisão.</p>
      )}
    </>
  );
}

/** Bloco recolhível com a situação da coleta do site do sindicato. */
export function SituacaoDaColeta({ status }: { status: Status }) {
  return (
    <section aria-labelledby="coleta" className="mt-12">
      <details className="group border-y border-slate-200 py-4">
        <summary id="coleta" className="cursor-pointer text-sm font-semibold text-slate-900 marker:text-slate-400">
          Situação da coleta do site do SINDEPRESTEM
        </summary>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
          <RelatorioDaVarredura status={status} />
          <p>
            O coletor consulta os sitemaps a cada 15 minutos; notícias antigas são revisadas diariamente ou quando o
            sitemap indica mudança. Isso não é atualização instantânea.
          </p>
        </div>
      </details>
    </section>
  );
}
