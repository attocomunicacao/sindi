'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, Calculator, Users } from 'lucide-react';
import { CENARIO_EXTERNO, CENARIO_INTERNO, estimar, mediaReal, type Cenario } from '@/lib/custos/calculo';
import { DATA_DOS_PRECOS, MODELOS } from '@/lib/custos/precos';
import { brl, numeroBR } from '@/lib/base/formato';
import { Cartao } from '@/componentes/ui/cartao';
import { CampoNumerico, CLASSE_CAIXA_DE_MARCACAO } from '@/componentes/ui/campo';
import { Seletor } from '@/componentes/ui/seletor';

const usd = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: v < 1 ? 3 : 2,
    maximumFractionDigits: v < 1 ? 3 : 2,
  });
const inteiro = (v: number) => numeroBR(Math.round(v));
const milhoes = (v: number) => `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;

const ORIGEM_DA_ESTIMATIVA = 'estimativa do projeto (≈ 2.000 de entrada e 250 de saída por chamada)';
type Premissas = Pick<Cenario, 'tokensDeEntrada' | 'tokensDeSaida' | 'fatorDeReescrita' | 'cambio'> & {
  usarCache: boolean;
};

type PropsDoCenario = {
  titulo: string;
  icone: ReactNode;
  cenario: Cenario;
  aoMudar: (c: Cenario) => void;
  prefixo: string;
};

function Resultado({ r }: { r: ReturnType<typeof estimar> }) {
  return (
    <>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-amber-50 p-4">
          <dt className="text-xs text-slate-600">Por mês</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{brl(r.totalBrl)}</dd>
          <dd className="text-xs tabular-nums text-slate-600">{usd(r.totalUsd)}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-xs text-slate-600">Por pessoa/mês</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{brl(r.porPessoaBrl)}</dd>
          <dd className="text-xs tabular-nums text-slate-600">{usd(r.porPessoaUsd)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        {inteiro(r.mensagens)} mensagens/mês → {inteiro(r.chamadas)} chamadas ao modelo (com reescritas) ·{' '}
        {milhoes(r.tokensEntrada)} tokens de entrada ({usd(r.custoEntrada)}) · {milhoes(r.tokensSaida)} de saída (
        {usd(r.custoSaida)}) · {usd(r.porMensagemUsd)} por mensagem.
      </p>
    </>
  );
}

/** Um cenário editável (interno ou externo) com o resultado ao lado; o cálculo é o mesmo de src/lib/custos/calculo.ts. */
function CartaoDoCenario({ titulo, icone, cenario, aoMudar, prefixo }: PropsDoCenario) {
  const resultado = useMemo(() => estimar(cenario), [cenario]);
  const mudar = (campo: keyof Cenario) => (valor: number | string | boolean) => aoMudar({ ...cenario, [campo]: valor });
  return (
    <Cartao como="section" aria-labelledby={`${prefixo}-titulo`} className="sm:p-6">
      <h2 id={`${prefixo}-titulo`} className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        {icone}
        {titulo}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CampoNumerico
          id={`${prefixo}-pessoas`}
          rotulo="Pessoas"
          valor={cenario.pessoas}
          aoMudar={mudar('pessoas')}
          max={100000}
        />
        <CampoNumerico
          id={`${prefixo}-msgs`}
          rotulo="Mensagens por pessoa/dia"
          valor={cenario.mensagensPorDia}
          aoMudar={mudar('mensagensPorDia')}
          max={1000}
        />
        <CampoNumerico
          id={`${prefixo}-dias`}
          rotulo="Dias de uso no mês"
          valor={cenario.diasPorMes}
          aoMudar={mudar('diasPorMes')}
          max={31}
        />
        <Seletor
          id={`${prefixo}-modelo`}
          rotulo="Modelo"
          classeDoGrupo="col-span-2 sm:col-span-3"
          className="tabular-nums"
          value={cenario.modelo}
          aoMudar={mudar('modelo')}
        >
          {MODELOS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — US$ {m.entrada.toLocaleString('pt-BR')} entrada / US$ {m.saida.toLocaleString('pt-BR')} saída
              por milhão de tokens
            </option>
          ))}
        </Seletor>
      </div>
      <Resultado r={resultado} />
    </Cartao>
  );
}

function CartaoDasPremissas({
  premissas,
  aoMudar,
  origem,
}: {
  premissas: Premissas;
  aoMudar: (campo: keyof Premissas, valor: number | boolean) => void;
  origem: string;
}) {
  return (
    <Cartao como="section" aria-labelledby="premissas" className="sm:p-6">
      <h2 id="premissas" className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Calculator size={17} aria-hidden />
        Premissas (valem para os dois cenários)
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CampoNumerico
          id="tok-entrada"
          rotulo="Tokens de entrada por chamada"
          valor={premissas.tokensDeEntrada}
          aoMudar={(v) => aoMudar('tokensDeEntrada', v)}
          passo={50}
          max={200000}
        />
        <CampoNumerico
          id="tok-saida"
          rotulo="Tokens de saída por chamada"
          valor={premissas.tokensDeSaida}
          aoMudar={(v) => aoMudar('tokensDeSaida', v)}
          passo={10}
          max={20000}
        />
        <CampoNumerico
          id="reescrita"
          rotulo="Fator de reescrita"
          valor={premissas.fatorDeReescrita}
          aoMudar={(v) => aoMudar('fatorDeReescrita', v)}
          passo={0.05}
          min={1}
          max={3}
        />
        <CampoNumerico
          id="cambio"
          rotulo="Câmbio (R$ por US$)"
          valor={premissas.cambio}
          aoMudar={(v) => aoMudar('cambio', v)}
          passo={0.05}
          max={50}
        />
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={premissas.usarCache}
          onChange={(e) => aoMudar('usarCache', e.target.checked)}
          className={CLASSE_CAIXA_DE_MARCACAO}
        />
        Usar cache de prompt (regras e exemplos a ~10% do preço de entrada)
      </label>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Tokens por chamada: {origem}. O fator de reescrita soma as respostas refeitas quando a verificação de fatos
        reprova um número ou contato.
      </p>
    </Cartao>
  );
}

function ComoLer() {
  return (
    <section aria-labelledby="notas" className="space-y-2 text-xs leading-6 text-slate-600">
      <h2 id="notas" className="text-sm font-semibold text-slate-800">
        Como ler
      </h2>
      <p>
        Hoje a SINDI roda em uma <strong>cascata de serviços gratuitos</strong> (Gemini, Groq, OpenRouter, Mistral,
        Cloudflare) com um modelo local de emergência: custo de API <strong>R$ 0</strong>, mas com limites diários de
        terceiros e sem garantia de serviço. Esta página estima o gasto se a resposta passar a vir de uma API paga da
        Anthropic, com contrato e limites previsíveis.
      </p>
      <p>
        Preços de tabela da Anthropic consultados em {DATA_DOS_PRECOS} (conferir antes de uma proposta). Não inclui
        impostos sobre serviço importado, IOF, hospedagem nem a busca por significado (embeddings), que continua no
        nível gratuito do Gemini. {MODELOS[0].observacao}
      </p>
    </section>
  );
}

export function CalculadoraDeCustos() {
  const [interno, setInterno] = useState<Cenario>(CENARIO_INTERNO);
  const [externo, setExterno] = useState<Cenario>(CENARIO_EXTERNO);
  const [premissas, setPremissas] = useState<Premissas>({
    tokensDeEntrada: CENARIO_INTERNO.tokensDeEntrada,
    tokensDeSaida: CENARIO_INTERNO.tokensDeSaida,
    fatorDeReescrita: CENARIO_INTERNO.fatorDeReescrita,
    usarCache: false,
    cambio: CENARIO_INTERNO.cambio,
  });
  const [origem, setOrigem] = useState(ORIGEM_DA_ESTIMATIVA);

  // Média real de tokens por chamada, se /uso já tiver medições suficientes (só agregados).
  useEffect(() => {
    const controle = new AbortController();
    fetch('/api/uso', { cache: 'no-store', signal: controle.signal })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((dados) => {
        const media = dados?.days ? mediaReal(dados.days) : undefined;
        if (!media) return;
        setPremissas((atual) => ({ ...atual, tokensDeEntrada: media.entrada, tokensDeSaida: media.saida }));
        setOrigem(`média real de ${inteiro(media.chamadas)} chamadas registradas em /uso`);
      })
      .catch(() => {});
    return () => controle.abort();
  }, []);
  const comPremissas = (cenario: Cenario): Cenario => ({ ...cenario, ...premissas });
  const mudarPremissa = (campo: keyof Premissas, valor: number | boolean) =>
    setPremissas({ ...premissas, [campo]: valor });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <CartaoDoCenario
          prefixo="interno"
          titulo="Uso interno — funcionários"
          icone={<Building2 size={18} aria-hidden />}
          cenario={comPremissas(interno)}
          aoMudar={setInterno}
        />
        <CartaoDoCenario
          prefixo="externo"
          titulo="Uso externo — associados"
          icone={<Users size={18} aria-hidden />}
          cenario={comPremissas(externo)}
          aoMudar={setExterno}
        />
      </div>
      <CartaoDasPremissas premissas={premissas} aoMudar={mudarPremissa} origem={origem} />
      <ComoLer />
    </div>
  );
}
