import { enderecoLocal } from '@/lib/rtc/endereco';
import { calcularCbsIbsSimples, escolherParAliquotas } from '@/lib/tributos/simples-cbs-ibs';

/**
 * Cliente da calculadora oficial do Simples Nacional (calculadora-rtc-simples-nacional, MIT), serviço local opcional ao lado do site (mesma regra de
 * endereço do regime regular: só esta máquina). A conferência usa o fluxo "não assistido" da NFS-e (tpDoc 91): quem chama informa as alíquotas efetivas do
 * PGDAS-D e o serviço só aplica a escolha do par e a conta, que é exatamente o que o SINDI reimplementa em src/lib/tributos/simples-cbs-ibs.ts.
 */
export type AnexoServico = 'III' | 'IV' | 'V';
type Par = { cbs: number; ibs: number };
export type EntradaSimplesOficial = {
  receita: number;
  anexo: AnexoServico;
  comRedistribuicao: Par;
  semRedistribuicao: Par;
  /** ISS retido pelo tomador (comum na cessão de mão de obra). */ retido: boolean;
  /** Operação sem ISS (imunidade, exportação, não incidência). */ semIss: boolean;
  /** Isenção municipal do ISS. */ isencao: boolean;
};
export type ResultadoSimplesOficial = { estado: string; vCBS: number; vIBS: number };

/** O catálogo de atividades do serviço só vigora a partir de 2027 (NT 2026.005); uma data fixa basta, porque a conta não depende do dia. */
export const DATA_DO_FATO = '2027-06-10';

export function enderecoDoServicoSimples(valor = process.env.SINDI_RTC_SIMPLES_URL) {
  return enderecoLocal(valor);
}

/**
 * Atividade (cAtivSN) que leva ao anexo pedido. Isenção municipal do ISS só vale nas atividades 12 (Anexo III) e 13 (Anexo IV); no Anexo V o serviço a ignora
 * e, por isso, a isenção não pode ser conferida ali (devolve undefined).
 */
export function atividadeDoAnexo(anexo: AnexoServico, isencao: boolean): string | undefined {
  if (isencao) return anexo === 'III' ? '12' : anexo === 'IV' ? '13' : undefined;
  return anexo === 'III' ? '07' : anexo === 'IV' ? '14' : '09';
}

const texto = (v: number) => String(v);
const par = (p: Par) => ({ pCBSSN: texto(p.cbs), pIBSSN: texto(p.ibs) });

/** O corpo que o serviço espera: uma NFS-e de optante ME/EPP com IBS/CBS e ISS pelo Simples, um item e as alíquotas efetivas do anexo. */
export function corpoParaOSimples(e: EntradaSimplesOficial) {
  const cAtivSN = atividadeDoAnexo(e.anexo, e.isencao);
  if (!cAtivSN) throw new Error('isenção municipal não é conferida no Anexo V');
  const anexo = { ...par(e.comRedistribuicao), semRedistribuicaoISS: par(e.semRedistribuicao) };
  const aliquotasEfetivas: { fatorR?: boolean; impedimentoSublimite: boolean } & Partial<
    Record<`anexo${AnexoServico}`, typeof anexo>
  > = { impedimentoSublimite: false, ...(e.anexo === 'V' ? { fatorR: false } : {}), [`anexo${e.anexo}`]: anexo };
  return {
    id: 'sindi-conferencia',
    versao: '3.0.0',
    data: DATA_DO_FATO,
    tpDoc: '91',
    opSimpNac: '3',
    regApIBSCBSSN: '1',
    regApTribSN: '1',
    aliquotasEfetivas,
    itens: [
      {
        numero: 1,
        cAtivSN,
        cClassTrib: '000001',
        nbs: '118012100',
        baseCalculo: e.receita.toFixed(2),
        tribISSQN: e.semIss ? '4' : '1',
        // tpRetISSQN só vale com tribISSQN 1 (nos demais o serviço o desconsidera, com aviso).
        ...(e.semIss ? {} : { tpRetISSQN: e.retido ? '2' : '1' }),
        ...(e.isencao ? { tpBM: '1' } : {}),
      },
    ],
  };
}

type RespostaDoServico = {
  objetos?: {
    estadoItem?: string;
    motivoEstado?: { codigo?: string; descricao?: string };
    erros?: { code?: string; title?: string }[];
    // O OpenAPI diz number, mas o serviço devolve texto ("1250.00"); aceita os dois.
    tribCalc?: { vCBSSN?: string | number; vIBSSN?: string | number };
  }[];
};

/** Lê a resposta do serviço: CBS e IBS do item, ou um erro com o código e o título que a Receita devolveu. */
export function lerRespostaDoSimples(dados: RespostaDoServico): ResultadoSimplesOficial {
  const objeto = dados.objetos?.[0];
  const t = objeto?.tribCalc;
  const vCBS = Number(t?.vCBSSN);
  const vIBS = Number(t?.vIBSSN);
  if (objeto?.estadoItem !== 'CALCULADO' || t?.vCBSSN == null || t.vIBSSN == null || !isFinite(vCBS + vIBS)) {
    const erro = objeto?.erros?.[0];
    throw new Error(
      erro
        ? `${erro.code ?? 'erro'}: ${erro.title ?? 'cálculo recusado pelo serviço'}`
        : (objeto?.motivoEstado?.descricao ?? 'resposta sem cálculo'),
    );
  }
  return { estado: objeto.estadoItem, vCBS, vIBS };
}

/** A mesma conta, feita pela lógica do SINDI com a escolha de par que a tela usa. */
export function calcularNoSindi(e: EntradaSimplesOficial) {
  const escolha = escolherParAliquotas({
    anexo: e.anexo,
    tribISSQN: e.semIss ? 4 : 1,
    tpBM: e.isencao ? 1 : undefined,
    tpRetISSQN: e.retido ? 2 : 1,
  });
  const usado = escolha.par === 'sem-redistribuicao' ? e.semRedistribuicao : e.comRedistribuicao;
  const r = calcularCbsIbsSimples({ receita: e.receita, pCBSSN: usado.cbs, pIBSSN: usado.ibs });
  return { vCBS: r.vCBS, vIBS: r.vIBS, par: escolha.par };
}

/** Pede o cálculo ao serviço oficial. Falha (serviço fora do ar, tempo esgotado, cálculo recusado) vira erro para o chamador usar a conta local. */
export async function calcularNoServicoSimples(
  entrada: EntradaSimplesOficial,
  endereco = enderecoDoServicoSimples(),
): Promise<ResultadoSimplesOficial> {
  if (!endereco) throw new Error('serviço do Simples Nacional não configurado');
  const resposta = await fetch(`${endereco}/calculadora/observabilidade/simples-nacional/nao-assistido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpoParaOSimples(entrada)),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!resposta.ok) throw new Error(`serviço respondeu ${resposta.status}`);
  return lerRespostaDoSimples((await resposta.json()) as RespostaDoServico);
}
