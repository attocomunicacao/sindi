import { enderecoLocal } from '@/lib/rtc/endereco';
import { servicoPorId } from '@/lib/tributos/servicos';
import type { AliquotasCbsIbs } from '@/lib/tributos/regime-regular';

/**
 * Cliente da calculadora oficial da Receita Federal (calculadora-rtc-regime-regular, MIT), que roda como serviço local ao lado do site. Só chama um endereço
 * desta máquina (como o Ollama): o serviço nunca vira uma porta para a rede interna (SSRF). Sem o serviço no ar, quem chama usa a calculadora do SINDI.
 */
export const MUNICIPIO_PADRAO = 3550308; // São Paulo (IBGE)
export const UF_PADRAO = 'SP';

/** Endereço do serviço, se for desta máquina (127.0.0.1, localhost ou ::1), sem usuário nem senha; qualquer outro valor desliga a integração. */
export function enderecoDoServicoRtc(valor = process.env.SINDI_RTC_REGIME_URL) {
  return enderecoLocal(valor);
}

export type EntradaOficial = {
  ano: number;
  base: number;
  servicoId: string;
  aliquotas?: AliquotasCbsIbs;
  /** Município (IBGE) e UF do local de incidência; a tela não os pergunta, então o padrão é São Paulo. A conferência em lote os varia. */
  municipio?: number;
  uf?: string;
};
export type ResultadoOficial = { estado: string; vCBS: number; vIBSUF: number; vIBSMun: number; vIBS: number };

/** O corpo que o serviço da Receita espera para um item de serviço (NBS, CST e cClassTrib vêm do catálogo do SINDI). */
export function corpoParaOServico({ ano, base, servicoId, aliquotas, municipio, uf }: EntradaOficial) {
  const servico = servicoPorId(servicoId);
  if (!servico) throw new Error('serviço desconhecido');
  return {
    id: '6194602ea71cbf9431c236de4409d920',
    versao: '1.0.0',
    dhFatoGerador: `${ano}-06-10T10:00:00-03:00`,
    municipio: municipio ?? MUNICIPIO_PADRAO,
    uf: uf ?? UF_PADRAO,
    itens: [
      {
        numero: 1,
        nbs: servico.nbs[0],
        cst: servico.cst,
        cClassTrib: servico.cClassTrib,
        baseCalculo: base,
        quantidade: 1,
        unidade: 'UN',
        ...(aliquotas
          ? { aliquotasNominais: { cbs: aliquotas.cbs, ibsEstadual: aliquotas.ibsUf, ibsMunicipal: aliquotas.ibsMun } }
          : {}),
      },
    ],
  };
}

type RespostaDoServico = {
  objetos?: {
    estadoItem?: string;
    erros?: { code?: string; title?: string }[];
    tribCalc?: {
      IBSCBS?: {
        gIBSCBS?: {
          gCBS?: { vCBS?: string };
          gIBSUF?: { vIBSUF?: string };
          gIBSMun?: { vIBSMun?: string };
          vIBS?: string;
        };
      };
    };
  }[];
};

/** Lê a resposta do serviço: os valores do primeiro item, ou um erro com o código e o título que a Receita devolveu. */
export function lerRespostaDoServico(dados: RespostaDoServico): ResultadoOficial {
  const objeto = dados.objetos?.[0];
  const g = objeto?.tribCalc?.IBSCBS?.gIBSCBS;
  if (!g?.gCBS?.vCBS || !g.gIBSUF?.vIBSUF || !g.gIBSMun?.vIBSMun || !g.vIBS) {
    const erro = objeto?.erros?.[0];
    throw new Error(
      erro ? `${erro.code ?? 'erro'}: ${erro.title ?? 'cálculo recusado pelo serviço'}` : 'resposta sem cálculo',
    );
  }
  return {
    estado: objeto?.estadoItem ?? 'CALCULADO',
    vCBS: Number(g.gCBS.vCBS),
    vIBSUF: Number(g.gIBSUF.vIBSUF),
    vIBSMun: Number(g.gIBSMun.vIBSMun),
    vIBS: Number(g.vIBS),
  };
}

/** Pede o cálculo ao serviço oficial. Falha (serviço fora do ar, tempo esgotado, cálculo recusado) vira erro para o chamador usar a conta local. */
export async function calcularNoServicoOficial(
  entrada: EntradaOficial,
  endereco = enderecoDoServicoRtc(),
): Promise<ResultadoOficial> {
  if (!endereco) throw new Error('serviço da Receita não configurado');
  const resposta = await fetch(`${endereco}/calculadora/observabilidade/regime-geral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpoParaOServico(entrada)),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!resposta.ok) throw new Error(`serviço respondeu ${resposta.status}`);
  return lerRespostaDoServico((await resposta.json()) as RespostaDoServico);
}
