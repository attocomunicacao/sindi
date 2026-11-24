'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Botao } from '@/componentes/ui/botao';
import { Cartao } from '@/componentes/ui/cartao';
import { AvisoLateral } from '@/componentes/ui/aviso';
import { CLASSE_CAIXA_DE_MARCACAO, CLASSE_CAMPO, CampoDecimal, CampoDeTexto } from '@/componentes/ui/campo';
import { lerNumero, numeroComCasas } from '@/lib/base/formato';
import { linkSeguro } from '@/lib/base/url-segura';
import { AVISOS, conteudoVencido, textoDeVigencia } from '@/lib/produtos/avisos';
import { AVISO_JURIDICO, ATUALIZADO_EM, FATOS, FONTE_OFICIAL, VALIDO_ATE } from '@/lib/jornada42/fatos';
import { PERFIS, roteiroDoPerfil, type IdDoPerfil } from '@/lib/jornada42/roteiro';
import { calcularImpacto } from '@/lib/jornada42/impacto';
import { AVISO_DO_MODELO, MODELOS, textoDoComunicado, type TipoDeComunicado } from '@/lib/jornada42/comunicados';

const reais = (v: number) => `R$ ${numeroComCasas(v, 2)}`;
const titulo = 'text-xl font-semibold text-slate-900';

/**
 * Kit Jornada 42: roteiro por perfil, custo do posto e modelos de comunicado. Tudo roda neste aparelho: não há fetch, rota nem armazenamento,
 * então o nome da empresa e o salário digitados nunca saem do navegador. `aulaUrl` vem da variável pública e só aparece se for um link https/http válido.
 */
export function KitJornada42({ aulaUrl = '' }: { aulaUrl?: string }) {
  const [perfilId, setPerfilId] = useState<IdDoPerfil>('contratos-publicos');
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const perfil = PERFIS.find((p) => p.id === perfilId)!;
  const passos = useMemo(() => roteiroDoPerfil(perfilId, marcadas), [perfilId, marcadas]);

  const [salario, setSalario] = useState('3.000,00');
  const [extras50, setExtras50] = useState('');
  const [extras100, setExtras100] = useState('');
  const [noturnas, setNoturnas] = useState('');
  const horas = (t: string) => (t.trim() ? lerNumero(t) : 0);
  const sal = lerNumero(salario);
  const h50 = horas(extras50);
  const h100 = horas(extras100);
  const hn = horas(noturnas);
  const impacto =
    sal !== undefined && h50 !== undefined && h100 !== undefined && hn !== undefined
      ? calcularImpacto({ salario: sal, horasExtras50: h50, horasExtras100: h100, horasNoturnas: hn })
      : undefined;

  const [empresa, setEmpresa] = useState('');
  const [modelo, setModelo] = useState<TipoDeComunicado>('tomador');
  const [copiado, setCopiado] = useState<'sim' | 'falhou' | ''>('');
  const comunicado = textoDoComunicado(modelo, empresa);
  const vencido = conteudoVencido(VALIDO_ATE);
  const aula = linkSeguro(aulaUrl);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(comunicado);
      setCopiado('sim');
    } catch {
      setCopiado('falhou');
    }
  };

  return (
    <div className="space-y-10">
      <Cartao como="section" aria-labelledby="j42-fatos" className="space-y-2 text-sm leading-6">
        <h2 id="j42-fatos" className={titulo}>
          O que a emenda diz
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Jornada semanal máxima de {FATOS.horas42} horas a partir de {FATOS.inicio42} e de {FATOS.horas40} horas a
            partir de {FATOS.inicio40}; {FATOS.diasDeRepouso} dias de repouso, um deles preferencialmente aos domingos.
          </li>
          <li>Sem redução salarial, inclusive nos pisos (art. 2º).</li>
          <li>
            Divisor do salário-hora: {FATOS.divisor42} (42 horas) e {FATOS.divisor40} (40 horas), segundo o{' '}
            {FATOS.decreto} (Planalto, 19/11/2026).
          </li>
        </ul>
        <p>
          Fonte oficial:{' '}
          <a
            href={FONTE_OFICIAL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4"
          >
            texto da emenda no Planalto
          </a>
          . {textoDeVigencia(ATUALIZADO_EM, VALIDO_ATE)}
        </p>
        {vencido && (
          <AvisoLateral role="status">
            O prazo de validade deste conteúdo passou: confira o texto da emenda e a regulamentação antes de usar.
          </AvisoLateral>
        )}
        <p>{AVISOS.naoEConsultoria}</p>
      </Cartao>

      <Cartao como="section" aria-labelledby="j42-roteiro" className="space-y-4">
        <h2 id="j42-roteiro" className={titulo}>
          1. Roteiro por perfil de empresa
        </h2>
        <div>
          <label htmlFor="j42-perfil" className="mb-1 block text-xs font-medium text-slate-600">
            Perfil da empresa
          </label>
          <select
            id="j42-perfil"
            className={CLASSE_CAMPO}
            value={perfilId}
            onChange={(e) => {
              setPerfilId(e.target.value as IdDoPerfil);
              setMarcadas([]);
            }}
          >
            {PERFIS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        <AvisoLateral tamanho="pequeno">{perfil.nota}</AvisoLateral>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-800">Marque o que se aplica</legend>
          {perfil.perguntas.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className={`${CLASSE_CAIXA_DE_MARCACAO} mt-0.5`}
                checked={marcadas.includes(p.id)}
                onChange={(e) => setMarcadas((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))}
              />
              <span>{p.texto}</span>
            </label>
          ))}
        </fieldset>
        <ol aria-label="Passos do roteiro" className="list-decimal space-y-3 pl-5 text-sm leading-6">
          {passos.map((p) => (
            <li key={p.id}>
              <p>{p.texto}</p>
              <p className="text-xs text-slate-600">Referência: {p.referencia}.</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-slate-600">{AVISO_JURIDICO}</p>
      </Cartao>

      <Cartao como="section" aria-labelledby="j42-impacto" className="space-y-4">
        <h2 id="j42-impacto" className={titulo}>
          2. Impacto no custo do posto
        </h2>
        <p className="text-sm text-slate-600">
          Salário-hora nos divisores {FATOS.divisor44} (jornada de hoje, {FATOS.horas44} horas), {FATOS.divisor42} e{' '}
          {FATOS.divisor40}. {AVISOS.custoNaoPreco} {AVISOS.dadosNoNavegador}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoDecimal id="j42-salario" rotulo="Salário mensal (R$)" value={salario} aoMudar={setSalario} />
          <CampoDecimal
            id="j42-h50"
            rotulo="Horas extras a 50% por mês"
            value={extras50}
            aoMudar={setExtras50}
            placeholder="0"
          />
          <CampoDecimal
            id="j42-h100"
            rotulo="Horas extras a 100% por mês"
            value={extras100}
            aoMudar={setExtras100}
            placeholder="0"
          />
          <CampoDecimal
            id="j42-hn"
            rotulo="Horas com adicional noturno (20%) por mês"
            value={noturnas}
            aoMudar={setNoturnas}
            placeholder="0"
          />
        </div>
        {impacto ? (
          <div className="overflow-x-auto" role="region" aria-label="Resultado do impacto" tabIndex={0}>
            <table className="w-full min-w-[40rem] text-left text-sm tabular-nums">
              <caption className="sr-only">Salário-hora, horas extras e adicional noturno por jornada</caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-600">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Jornada (divisor)
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Salário-hora
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Variação sobre {FATOS.divisor44}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Hora extra 50% / 100%
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Adicional noturno por hora
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Extras e noturno no mês
                  </th>
                </tr>
              </thead>
              <tbody>
                {impacto.cenarios.map((c) => (
                  <tr key={c.divisor} className="border-b border-slate-100">
                    <th scope="row" className="py-2 pr-3 font-medium text-slate-900">
                      {c.rotulo} ({c.divisor})
                    </th>
                    <td className="py-2 pr-3">{reais(c.salarioHora)}</td>
                    <td className="py-2 pr-3">{numeroComCasas(c.variacaoPercentual, 2)}%</td>
                    <td className="py-2 pr-3">
                      {reais(c.horaExtra50)} / {reais(c.horaExtra100)}
                    </td>
                    <td className="py-2 pr-3">{reais(c.adicionalNoturnoHora)}</td>
                    <td className="py-2">{reais(c.totalVariaveis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <AvisoLateral role="status">
            Informe um salário maior que zero e horas válidas (até 744 por mês) para ver o resultado.
          </AvisoLateral>
        )}
        <p className="text-xs text-slate-600">
          Exemplo do Planalto (salário de R$ 3.000,00): hora de R$ 13,64 hoje, R$ 14,29 com {FATOS.horas42} horas e R${' '}
          15,00 com {FATOS.horas40} horas. Valores em centavos, arredondados uma vez (meio exato vai ao par).
        </p>
        <p className="text-sm">
          Para montar o orçamento dos postos, use o{' '}
          <Link
            href="/orcamento"
            className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4"
          >
            orçamento de terceirização
          </Link>
          ; esta calculadora não altera o cálculo dele.
        </p>
      </Cartao>

      <Cartao como="section" aria-labelledby="j42-modelos" className="space-y-4">
        <h2 id="j42-modelos" className={titulo}>
          3. Modelos de comunicado
        </h2>
        <AvisoLateral>{AVISO_DO_MODELO}</AvisoLateral>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoDeTexto
            id="j42-empresa"
            rotulo="Nome da empresa"
            value={empresa}
            maxLength={120}
            autoComplete="off"
            aoMudar={(v) => {
              setEmpresa(v);
              setCopiado('');
            }}
          />
          <div>
            <label htmlFor="j42-modelo" className="mb-1 block text-xs font-medium text-slate-600">
              Modelo
            </label>
            <select
              id="j42-modelo"
              className={CLASSE_CAMPO}
              value={modelo}
              onChange={(e) => {
                setModelo(e.target.value as TipoDeComunicado);
                setCopiado('');
              }}
            >
              {MODELOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="j42-texto" className="block text-xs font-medium text-slate-600">
          Texto do comunicado
        </label>
        <textarea id="j42-texto" readOnly rows={16} className={`${CLASSE_CAMPO} font-mono`} value={comunicado} />
        <div className="flex flex-wrap items-center gap-3">
          <Botao type="button" onClick={copiar}>
            Copiar texto
          </Botao>
          <span role="status" className="text-sm text-slate-600">
            {copiado === 'sim' && 'Texto copiado.'}
            {copiado === 'falhou' && 'Não foi possível copiar: selecione o texto e copie à mão.'}
          </span>
        </div>
      </Cartao>

      {aula !== '#' && (
        <Cartao como="section" aria-labelledby="j42-aula" className="space-y-2 text-sm">
          <h2 id="j42-aula" className={titulo}>
            Aula gravada
          </h2>
          <p>
            <a
              href={aula}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-4"
            >
              Assistir à aula sobre a Jornada 42
            </a>
          </p>
        </Cartao>
      )}
    </div>
  );
}
