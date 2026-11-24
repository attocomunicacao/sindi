'use client';
import { useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { numeroBR } from '@/lib/base/formato';
import { Botao } from '@/componentes/ui/botao';
import { Cartao } from '@/componentes/ui/cartao';
import { SaibaMais } from '@/componentes/ui/saiba-mais';
import { Principal } from '@/componentes/ui/pagina-ferramenta';
import {
  dataCompleta,
  somarCerebro,
  somarDias,
  somarPorProvedor,
  type TotaisDoPeriodo,
} from '@/componentes/uso/calculos-de-uso';
import { GraficoDiario, type MetricaDoGrafico } from '@/componentes/uso/grafico-diario';
import { useUso, type Uso } from '@/componentes/uso/usar-uso';
import type { DiaDeUso } from '@/lib/infra/uso';

const NOMES_DOS_PROVEDORES: Record<string, string> = {
  gemini: 'Gemini (Google)',
  groq: 'Groq',
  mistral: 'Mistral',
  ollama: 'Modelo local (Ollama)',
};

const CLASSE_DA_TABELA = 'w-full text-left text-xs';
const CLASSE_DA_CELULA = 'p-2';
const CLASSE_DA_LINHA = 'border-t border-slate-100';

function Numeros({ totais, disponivel }: { totais: TotaisDoPeriodo; disponivel: boolean }) {
  const cartoes: [string, number][] = [
    ['Requisições', totais.requests],
    ['Tokens de entrada', totais.inputTokens],
    ['Tokens de saída', totais.outputTokens],
    ['Tokens totais', totais.totalTokens],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cartoes.map(([rotulo, valor]) => (
        <Cartao key={rotulo} className="min-w-0 p-4 sm:p-5">
          <p className="text-xs text-slate-500">{rotulo}</p>
          <p className="mt-3 text-xl font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl">
            {disponivel ? numeroBR(valor) : '—'}
          </p>
        </Cartao>
      ))}
    </div>
  );
}

function Filtros({
  periodo,
  aoMudarPeriodo,
  metrica,
  aoMudarMetrica,
}: {
  periodo: number;
  aoMudarPeriodo: (dias: number) => void;
  metrica: MetricaDoGrafico;
  aoMudarMetrica: (m: MetricaDoGrafico) => void;
}) {
  const classe = 'ml-2 rounded-lg border border-slate-200 bg-surface p-2';
  return (
    <div className="my-7 flex flex-wrap gap-3">
      <label className="text-sm">
        Período{' '}
        <select
          aria-label="Período"
          value={periodo}
          onChange={(e) => aoMudarPeriodo(Number(e.target.value))}
          className={classe}
        >
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
        </select>
      </label>
      <label className="text-sm">
        Gráfico{' '}
        <select
          aria-label="Gráfico"
          value={metrica}
          onChange={(e) => aoMudarMetrica(e.target.value as MetricaDoGrafico)}
          className={classe}
        >
          <option value="totalTokens">Tokens</option>
          <option value="requests">Requisições</option>
        </select>
      </label>
    </div>
  );
}

function TabelaPorProvedor({ dias }: { dias: DiaDeUso[] }) {
  const porProvedor = somarPorProvedor(dias);
  if (!porProvedor.length) return null;
  return (
    <Cartao como="section" className="mb-5" aria-label="Respostas por provedor de IA">
      <h2 className="mb-3 text-sm font-medium">Quem respondeu (cascata de provedores)</h2>
      <div className="overflow-x-auto">
        <table className={CLASSE_DA_TABELA}>
          <thead>
            <tr>
              {['Provedor', 'Respostas escritas', 'Tentativas registradas', 'Tokens'].map((h) => (
                <th key={h} className={CLASSE_DA_CELULA}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porProvedor.map(([id, uso]) => (
              <tr key={id} className={CLASSE_DA_LINHA}>
                <td className={`${CLASSE_DA_CELULA} font-medium`}>{NOMES_DOS_PROVEDORES[id] ?? id}</td>
                <td className={`${CLASSE_DA_CELULA} tabular-nums`}>{numeroBR(uso.successes)}</td>
                <td className={`${CLASSE_DA_CELULA} tabular-nums`}>{numeroBR(uso.requests)}</td>
                <td className={`${CLASSE_DA_CELULA} tabular-nums`}>{numeroBR(uso.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

const NOMES_DAS_ORIGENS: Record<string, string> = {
  cerebro: 'Conhecimento da equipe (cérebro)',
  biblioteca: 'Biblioteca de documentos',
  grafo: 'Grafo de leis e projetos',
  externa: 'Fontes públicas (Câmara, Senado, TST...)',
  documento: 'Documentos oficiais (NR, leis, convenções, indicadores)',
  ferramenta: 'Ferramentas do site',
  contato: 'Contato do sindicato (encaminhamento)',
  nenhuma: 'Sem fonte (resposta por regra)',
};

/** O que o cérebro entregou nas respostas do período: de onde vieram as fontes, qual área atendeu e quais situações foram tratadas por regra. Só agregados. */
function TabelaDoCerebro({ dias }: { dias: DiaDeUso[] }) {
  const soma = somarCerebro(dias);
  const total = soma.origem.reduce((n, [, v]) => n + v, 0);
  if (!total) return null;
  const grupos: [string, [string, number][], (id: string) => string][] = [
    ['Origem das fontes', soma.origem, (id) => NOMES_DAS_ORIGENS[id] ?? id],
    ['Área que atendeu', soma.conector, (id) => (id === 'nenhum' ? 'Nenhuma área específica' : id.replace(/-/g, ' '))],
    ['Situação tratada por regra', soma.situacao, (id) => id.replace(/-/g, ' ')],
  ];
  return (
    <Cartao como="section" className="mb-5" aria-label="O que o cérebro entregou nas respostas">
      <h2 className="mb-3 text-sm font-medium">O cérebro nas respostas</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {grupos.map(([titulo, linhas, nome]) =>
          linhas.length ? (
            <table key={titulo} className={CLASSE_DA_TABELA}>
              <thead>
                <tr>
                  <th className={CLASSE_DA_CELULA}>{titulo}</th>
                  <th className={CLASSE_DA_CELULA}>Respostas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(([id, n]) => (
                  <tr key={id} className={CLASSE_DA_LINHA}>
                    <td className={`${CLASSE_DA_CELULA} font-medium`}>{nome(id)}</td>
                    <td className={`${CLASSE_DA_CELULA} tabular-nums`}>{numeroBR(n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null,
        )}
      </div>
    </Cartao>
  );
}

function TabelaDiaria({ dias }: { dias: DiaDeUso[] }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-surface p-4">
      <summary className="cursor-pointer text-sm">Ver dados diários</summary>
      <div className="mt-4 overflow-x-auto">
        <table className={CLASSE_DA_TABELA}>
          <thead>
            <tr>
              {['Data', 'Chamadas', 'Entrada', 'Saída', 'Total', 'Erros'].map((h) => (
                <th key={h} className={CLASSE_DA_CELULA}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.date} className={CLASSE_DA_LINHA}>
                <td className={CLASSE_DA_CELULA}>{dataCompleta(d.date)}</td>
                {[d.requests, d.inputTokens, d.outputTokens, d.totalTokens, d.errors].map((n, i) => (
                  <td key={i} className={CLASSE_DA_CELULA}>
                    {numeroBR(n)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Explicacoes({ armazenamento }: { armazenamento?: Uso['storage'] }) {
  const historico =
    armazenamento === 'local'
      ? 'Histórico salvo neste computador. '
      : armazenamento === 'shared'
        ? 'Histórico compartilhado da aplicação. '
        : '';
  return (
    <SaibaMais titulo="Como ler estes números" className="mt-7">
      <p>
        Entrada inclui sua pergunta, as instruções da SINDI e o contexto da conversa. Saída é a geração do modelo; o
        total pode incluir tokens de raciocínio, conforme informado pelo modelo. Falhas sem dados de consumo não entram
        nos totais de tokens.
      </p>
      <p>
        A SINDI responde por uma cascata de serviços de IA gratuitos (Gemini, Groq, Mistral) e, em último caso, por um
        modelo local; ela limita as mensagens por pessoa e por dia para não esgotar esses limites. Este painel mostra
        apenas chamadas feitas pela SINDI desde o início da coleta; não mostra uso de outras aplicações, saldo de cota
        nem faturamento.
      </p>
      <p>
        {historico}Datas no horário de São Paulo. Somente números agregados são armazenados; nenhuma conversa, IP ou
        chave aparece neste painel.
      </p>
    </SaibaMais>
  );
}

/** Página "Uso da IA": consumo de tokens e requisições por dia, por provedor da cascata, sem conversas, IPs nem chaves. */
export function PainelDeUso() {
  const { dados, erro, carregando, atualizar } = useUso();
  const [periodo, setPeriodo] = useState(7);
  const [metrica, setMetrica] = useState<MetricaDoGrafico>('totalTokens');
  const dias = dados?.days.slice(-periodo) || [];
  const totais = somarDias(dias);
  const nomeDaMetrica = metrica === 'totalTokens' ? 'tokens' : 'requisições';
  return (
    <Principal className="max-w-[120rem] py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Uso da IA</h1>
        </div>
        <Botao variante="discreto" onClick={() => void atualizar()} disabled={carregando}>
          <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
          Atualizar
        </Botao>
      </div>
      {erro && (
        <p className="mt-5 text-sm text-amber-900" role="alert">
          {erro}
        </p>
      )}
      {dados && !dados.available && (
        <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          O chat está liberado, mas o armazenamento das métricas ainda não foi configurado nesta hospedagem. Os números
          abaixo não representam consumo registrado.
        </p>
      )}
      <Filtros periodo={periodo} aoMudarPeriodo={setPeriodo} metrica={metrica} aoMudarMetrica={setMetrica} />
      <Numeros totais={totais} disponivel={Boolean(dados?.available)} />
      <Cartao como="section" className="mt-6 sm:p-7" aria-label="Gráfico de uso diário">
        <h2 className="mb-6 flex items-center gap-2 text-sm font-medium">
          <BarChart3 size={17} />
          {metrica === 'totalTokens' ? 'Tokens consumidos por dia' : 'Requisições por dia'}
        </h2>
        <div
          role="img"
          aria-label={`Gráfico de ${nomeDaMetrica} nos últimos ${periodo} dias. Valores detalhados na tabela abaixo.`}
        >
          <GraficoDiario dias={dias} metrica={metrica} />
        </div>
        {dados?.available && totais.requests === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            Nenhuma chamada registrada no período. A coleta começa a partir desta atualização.
          </p>
        )}
      </Cartao>
      <div className="my-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
        <span>Respostas: {numeroBR(totais.successes)}</span>
        <span>Erros: {numeroBR(totais.errors)}</span>
        <span>Tempo médio: {totais.requests ? (totais.durationMs / totais.requests / 1000).toFixed(1) : '0'} s</span>
        <span>Chamadas com tokens informados: {numeroBR(totais.measured)}</span>
      </div>
      <TabelaPorProvedor dias={dias} />
      <TabelaDoCerebro dias={dias} />
      <TabelaDiaria dias={dias} />
      <Explicacoes armazenamento={dados?.storage} />
    </Principal>
  );
}
