'use client';
import { useEffect, useMemo, useState } from 'react';
import { Building2, Calculator, Users } from 'lucide-react';
import { CENARIO_EXTERNO, CENARIO_INTERNO, estimar, mediaReal, type Cenario } from '@/lib/custos/calculo';
import { DATA_DOS_PRECOS, MODELOS } from '@/lib/custos/precos';
import { brl, numeroBR } from '@/lib/base/formato';

const usd = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: v < 1 ? 3 : 2, maximumFractionDigits: v < 1 ? 3 : 2 });
const num = (v: number) => numeroBR(Math.round(v));
const milhoes = (v: number) => `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
const campo = 'w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 tabular-nums focus-visible:border-amber-400 focus-visible:outline-none';
const rotulo = 'mb-1 block text-xs font-medium text-slate-600';

function Numero({ id, label, valor, aoMudar, passo = 1, min = 0, max }: { id: string; label: string; valor: number; aoMudar: (n: number) => void; passo?: number; min?: number; max?: number }) {
  return <div><label htmlFor={id} className={rotulo}>{label}</label>
    <input id={id} type="number" inputMode="decimal" className={campo} value={valor} step={passo} min={min} max={max} onChange={e => aoMudar(Number(e.target.value))} /></div>;
}

/** Um cenário editável (interno ou externo) com o resultado ao lado; o cálculo é o mesmo de src/lib/custos/calculo.ts. */
function CartaoDoCenario({ titulo, icone, cenario, setCenario, prefixo }: { titulo: string; icone: React.ReactNode; cenario: Cenario; setCenario: (c: Cenario) => void; prefixo: string }) {
  const r = useMemo(() => estimar(cenario), [cenario]);
  const muda = (campo: keyof Cenario) => (v: number | string | boolean) => setCenario({ ...cenario, [campo]: v });
  return <section aria-labelledby={`${prefixo}-titulo`} className="rounded-2xl border border-slate-200 bg-surface p-5 sm:p-6">
    <h2 id={`${prefixo}-titulo`} className="flex items-center gap-2 text-lg font-semibold text-slate-900">{icone}{titulo}</h2>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Numero id={`${prefixo}-pessoas`} label="Pessoas" valor={cenario.pessoas} aoMudar={muda('pessoas')} max={100000} />
      <Numero id={`${prefixo}-msgs`} label="Mensagens por pessoa/dia" valor={cenario.mensagensPorDia} aoMudar={muda('mensagensPorDia')} max={1000} />
      <Numero id={`${prefixo}-dias`} label="Dias de uso no mês" valor={cenario.diasPorMes} aoMudar={muda('diasPorMes')} max={31} />
      <div className="col-span-2 sm:col-span-3"><label htmlFor={`${prefixo}-modelo`} className={rotulo}>Modelo</label>
        <select id={`${prefixo}-modelo`} className={campo} value={cenario.modelo} onChange={e => muda('modelo')(e.target.value)}>
          {MODELOS.map(m => <option key={m.id} value={m.id}>{m.nome} — US$ {m.entrada.toLocaleString('pt-BR')} entrada / US$ {m.saida.toLocaleString('pt-BR')} saída por milhão de tokens</option>)}
        </select></div>
    </div>
    <dl className="mt-5 grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-amber-50 p-4"><dt className="text-xs text-slate-600">Por mês</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{brl(r.totalBrl)}</dd><dd className="text-xs tabular-nums text-slate-600">{usd(r.totalUsd)}</dd></div>
      <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs text-slate-600">Por pessoa/mês</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{brl(r.porPessoaBrl)}</dd><dd className="text-xs tabular-nums text-slate-600">{usd(r.porPessoaUsd)}</dd></div>
    </dl>
    <p className="mt-3 text-xs leading-5 text-slate-600">
      {num(r.mensagens)} mensagens/mês → {num(r.chamadas)} chamadas ao modelo (com reescritas) · {milhoes(r.tokensEntrada)} tokens de entrada ({usd(r.custoEntrada)}) ·{' '}
      {milhoes(r.tokensSaida)} de saída ({usd(r.custoSaida)}) · {usd(r.porMensagemUsd)} por mensagem.
    </p>
  </section>;
}

export function CustosCalculadora() {
  const [interno, setInterno] = useState<Cenario>(CENARIO_INTERNO);
  const [externo, setExterno] = useState<Cenario>(CENARIO_EXTERNO);
  const [comum, setComum] = useState({ tokensDeEntrada: CENARIO_INTERNO.tokensDeEntrada, tokensDeSaida: CENARIO_INTERNO.tokensDeSaida, fatorDeReescrita: CENARIO_INTERNO.fatorDeReescrita, usarCache: false, cambio: CENARIO_INTERNO.cambio });
  const [origem, setOrigem] = useState('estimativa do projeto (≈ 2.000 de entrada e 250 de saída por chamada)');

  // Média real de tokens por chamada, se /uso já tiver medições suficientes (só agregados).
  useEffect(() => {
    const controle = new AbortController();
    fetch('/api/uso', { cache: 'no-store', signal: controle.signal }).then(r => (r.ok ? r.json() : undefined)).then(dados => {
      const media = dados?.days ? mediaReal(dados.days) : undefined;
      if (media) { setComum(c => ({ ...c, tokensDeEntrada: media.entrada, tokensDeSaida: media.saida })); setOrigem(`média real de ${num(media.chamadas)} chamadas registradas em /uso`); }
    }).catch(() => {});
    return () => controle.abort();
  }, []);
  const comComum = (c: Cenario): Cenario => ({ ...c, ...comum });
  const muda = (campo: keyof typeof comum) => (v: number | boolean) => setComum({ ...comum, [campo]: v });

  return <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-2">
      <CartaoDoCenario prefixo="interno" titulo="Uso interno — funcionários" icone={<Building2 size={18} aria-hidden />} cenario={comComum(interno)} setCenario={c => setInterno(c)} />
      <CartaoDoCenario prefixo="externo" titulo="Uso externo — associados" icone={<Users size={18} aria-hidden />} cenario={comComum(externo)} setCenario={c => setExterno(c)} />
    </div>
    <section aria-labelledby="premissas" className="rounded-2xl border border-slate-200 bg-surface p-5 sm:p-6">
      <h2 id="premissas" className="flex items-center gap-2 text-base font-semibold text-slate-900"><Calculator size={17} aria-hidden />Premissas (valem para os dois cenários)</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero id="tok-entrada" label="Tokens de entrada por chamada" valor={comum.tokensDeEntrada} aoMudar={muda('tokensDeEntrada')} passo={50} max={200000} />
        <Numero id="tok-saida" label="Tokens de saída por chamada" valor={comum.tokensDeSaida} aoMudar={muda('tokensDeSaida')} passo={10} max={20000} />
        <Numero id="reescrita" label="Fator de reescrita" valor={comum.fatorDeReescrita} aoMudar={muda('fatorDeReescrita')} passo={0.05} min={1} max={3} />
        <Numero id="cambio" label="Câmbio (R$ por US$)" valor={comum.cambio} aoMudar={muda('cambio')} passo={0.05} max={50} />
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={comum.usarCache} onChange={e => muda('usarCache')(e.target.checked)} className="size-4 accent-amber-500" />Usar cache de prompt (regras e exemplos a ~10% do preço de entrada)</label>
      <p className="mt-3 text-xs leading-5 text-slate-600">Tokens por chamada: {origem}. O fator de reescrita soma as respostas refeitas quando a verificação de fatos reprova um número ou contato.</p>
    </section>
    <section aria-labelledby="notas" className="space-y-2 text-xs leading-6 text-slate-600">
      <h2 id="notas" className="text-sm font-semibold text-slate-800">Como ler</h2>
      <p>Hoje a SINDI roda em uma <strong>cascata de serviços gratuitos</strong> (Gemini, Groq, OpenRouter, Mistral, Cloudflare) com um modelo local de emergência: custo de API <strong>R$ 0</strong>, mas com limites diários de terceiros e sem garantia de serviço. Esta página estima o gasto se a resposta passar a vir de uma API paga da Anthropic, com contrato e limites previsíveis.</p>
      <p>Preços de tabela da Anthropic consultados em {DATA_DOS_PRECOS} (conferir antes de uma proposta). Não inclui impostos sobre serviço importado, IOF, hospedagem nem a busca por significado (embeddings), que continua no nível gratuito do Gemini. {MODELOS[0].observacao}</p>
    </section>
  </div>;
}
