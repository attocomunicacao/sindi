'use client';
import { useMemo, useState } from 'react';
import { CircleCheck, CircleX, Printer, RotateCcw, TriangleAlert } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Cartao } from '@/componentes/ui/cartao';
import { AvisoLateral } from '@/componentes/ui/aviso';
import { linkSeguro } from '@/lib/base/url-segura';
import { AVISOS, conteudoVencido, textoDeVigencia } from '@/lib/produtos/avisos';
import { ATUALIZADO_EM, PERGUNTAS, TEMAS, VALIDO_ATE, type Fonte } from '@/lib/diagnostico/perguntas';
import {
  OPCOES,
  TEXTO_DO_SEMAFORO,
  diagnosticar,
  faltam,
  type Resposta,
  type Respostas,
  type Semaforo,
} from '@/lib/diagnostico/pontuacao';

const titulo = 'text-xl font-semibold text-slate-900';
const LINK =
  'font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-amber-400';

/** Cores só reforçam: o semáforo sempre vem com ícone e palavra, para quem não distingue cores e para o leitor de tela. */
const ESTILO: Record<Semaforo, { classe: string; Icone: typeof CircleCheck }> = {
  verde: {
    classe:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
    Icone: CircleCheck,
  },
  amarelo: { classe: 'border-amber-300 bg-amber-50 text-amber-900', Icone: TriangleAlert },
  vermelho: {
    classe: 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200',
    Icone: CircleX,
  },
};

function Selo({ semaforo }: { semaforo: Semaforo }) {
  const { classe, Icone } = ESTILO[semaforo];
  const t = TEXTO_DO_SEMAFORO[semaforo];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${classe}`}>
      <Icone size={16} aria-hidden />
      {t.rotulo}
      <span className="sr-only">: {t.leitura}</span>
    </span>
  );
}

function Fontes({ fontes }: { fontes: readonly Fonte[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">
      {fontes.map((f) => (
        <li key={f.url + f.rotulo}>
          Fonte oficial:{' '}
          <a href={linkSeguro(f.url)} target="_blank" rel="noopener noreferrer" className={LINK}>
            {f.rotulo}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Diagnóstico de Exposição: 15 perguntas, semáforo por tema e plano de ação. Tudo roda neste aparelho: não há requisição, rota nem
 * armazenamento do navegador de nenhum tipo, então as respostas existem só na memória desta aba e somem ao recarregar ou fechar.
 * "Imprimir ou salvar em PDF" usa a janela de impressão do navegador; nada vai ao servidor.
 */
export function DiagnosticoDeExposicao() {
  const [respostas, setRespostas] = useState<Respostas>({});
  const resultado = useMemo(() => diagnosticar(respostas), [respostas]);
  const restantes = faltam(respostas);
  const vencido = conteudoVencido(VALIDO_ATE);

  return (
    <div className="space-y-10">
      <Cartao como="section" aria-labelledby="dx-sobre" className="space-y-2 text-sm leading-6">
        <h2 id="dx-sobre" className={titulo}>
          Como funciona
        </h2>
        <p>
          Responda {PERGUNTAS.length} perguntas sobre jornada, contratos e segurança do trabalho. Cada tema recebe um
          semáforo e as respostas que não são &quot;sim&quot; viram um plano de ação. Cada pergunta mostra a fonte
          oficial de onde vem. Pontuação: sim = 0, em parte = 1, não = 2, não sei = 2 e não se aplica = 0; por tema,
          verde de 0 a 1 ponto, amarelo de 2 a 3 e vermelho de 4 a 6.
        </p>
        <p>{AVISOS.dadosNoNavegador} As respostas não são guardadas nem enviadas: ao recarregar a página, somem.</p>
        <p>
          {AVISOS.naoEConsultoria} O plano de ação é orientação geral, não parecer.{' '}
          {textoDeVigencia(ATUALIZADO_EM, VALIDO_ATE)}
        </p>
        {vencido && (
          <AvisoLateral role="status">
            O prazo de validade deste conteúdo passou: confira as fontes oficiais antes de usar.
          </AvisoLateral>
        )}
      </Cartao>

      <div className="no-print space-y-6">
        {TEMAS.map((tema, n) => (
          <Cartao key={tema.id} como="section" aria-labelledby={`dx-${tema.id}`} className="space-y-5">
            <div>
              <h2 id={`dx-${tema.id}`} className={titulo}>
                {n + 1}. {tema.rotulo}
              </h2>
              <p className="text-sm text-slate-600">{tema.descricao}</p>
            </div>
            {PERGUNTAS.filter((p) => p.tema === tema.id).map((p) => (
              <fieldset key={p.id} className="space-y-2">
                <legend className="text-sm font-medium leading-6 text-slate-900">{p.texto}</legend>
                <p className="text-xs leading-5 text-slate-600">O que a fonte diz: {p.fato}</p>
                <Fontes fontes={p.fontes} />
                <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                  {OPCOES.map((o) => (
                    <label key={o.valor} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`dx-${p.id}`}
                        value={o.valor}
                        className="size-4 accent-amber-500"
                        checked={respostas[p.id] === o.valor}
                        onChange={() => setRespostas((r) => ({ ...r, [p.id]: o.valor as Resposta }))}
                      />
                      {o.rotulo}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </Cartao>
        ))}
      </div>

      <Cartao como="section" aria-labelledby="dx-resultado" className="space-y-5">
        <h2 id="dx-resultado" className={titulo}>
          Resultado
        </h2>
        <p className="no-print text-sm text-slate-600" role="status">
          {restantes > 0
            ? `Faltam ${restantes} de ${PERGUNTAS.length} perguntas para ver o resultado.`
            : 'Todas as perguntas respondidas.'}
        </p>
        {resultado && (
          <div className="space-y-6" role="region" aria-label="Resultado do diagnóstico" tabIndex={0}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-900">Visão geral:</span>
              <Selo semaforo={resultado.geral.semaforo} />
              <span className="text-sm text-slate-600">
                {resultado.geral.pontos} de {resultado.geral.maximo} pontos de exposição
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Semáforo por tema</caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-600">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Tema
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Pontos
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Semáforo
                  </th>
                </tr>
              </thead>
              <tbody>
                {resultado.temas.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {t.rotulo}
                    </th>
                    <td className="py-2 pr-3 tabular-nums">
                      {t.pontos} de {t.maximo}
                    </td>
                    <td className="py-2">
                      <Selo semaforo={t.semaforo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">Plano de ação</h3>
              {resultado.plano.length === 0 ? (
                <p className="text-sm">
                  Suas respostas não apontaram pendências. Isso não garante a conformidade da empresa: confirme com o
                  Setor Jurídico do SINDEPRESTEM.
                </p>
              ) : (
                <ol aria-label="Itens do plano de ação" className="list-decimal space-y-4 pl-5 text-sm leading-6">
                  {resultado.plano.map((item) => (
                    <li key={item.perguntaId} className="break-inside-avoid space-y-1">
                      <p className="font-medium text-slate-900">
                        {TEMAS.find((t) => t.id === item.tema)?.rotulo}: {item.pergunta.texto}
                      </p>
                      {item.porDesconhecimento && (
                        <p className="text-xs text-slate-600">
                          Você respondeu &quot;não sei&quot;: o primeiro passo é descobrir a situação da empresa neste
                          ponto.
                        </p>
                      )}
                      <p>{item.acao}</p>
                      <Fontes fontes={item.pergunta.fontes} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <p className="text-sm text-slate-600">
              {AVISOS.naoEConsultoria} {textoDeVigencia(ATUALIZADO_EM, VALIDO_ATE)}
            </p>
          </div>
        )}
        <div className="no-print flex flex-wrap gap-3">
          {resultado && (
            <Botao type="button" onClick={() => window.print()}>
              <Printer size={16} aria-hidden />
              Imprimir ou salvar em PDF
            </Botao>
          )}
          <Botao type="button" variante="contorno" onClick={() => setRespostas({})}>
            <RotateCcw size={16} aria-hidden />
            Limpar respostas
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}
