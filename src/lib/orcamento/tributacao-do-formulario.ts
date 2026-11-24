// Converte o que a pessoa digitou na seção "Tributos" do orçamento na entrada do cálculo. Puro e sem imports de Node: roda no navegador.
import { lerNumero } from '@/lib/base/formato';
import type { TributacaoEntrada } from '@/lib/orcamento/tributacao';
import type { Anexo } from '@/lib/tributos/das';
import { LIMITE_RBT12 } from '@/lib/tributos/das';
import type { AliquotasEmTexto } from '@/lib/tributos/formulario';
import { ALIQUOTAS_ESTIMADAS } from '@/lib/tributos/regime-regular';

export type ModoTributacao = 'atual' | 'reforma' | 'simples';
export type SimplesEmTexto = { anexo: Anexo; rbt12: string; folha12: string; ano: number; pCBS: string; pIBS: string };

/** `tributacao` quando a escolha já vale; `pendente` explica por que ainda não vale (ex.: RBT12 em branco), e a tela segue nas regras atuais. */
export type TributacaoDoFormulario = { tributacao?: TributacaoEntrada; pendente?: string };

const LIMITE_ALIQUOTA = 100;

function reforma(ano: number, aliquotas: AliquotasEmTexto): TributacaoDoFormulario {
  if (ano < 2027) return { tributacao: { modo: 'reforma', ano } };
  const a = { cbs: lerNumero(aliquotas.cbs), ibsUf: lerNumero(aliquotas.ibsUf), ibsMun: lerNumero(aliquotas.ibsMun) };
  if (
    a.cbs === undefined ||
    a.ibsUf === undefined ||
    a.ibsMun === undefined ||
    Math.max(a.cbs, a.ibsUf, a.ibsMun) > LIMITE_ALIQUOTA
  ) {
    return { pendente: 'Informe as três alíquotas (CBS, IBS UF e IBS município) entre 0 e 100.' };
  }
  const padrao = ALIQUOTAS_ESTIMADAS[ano];
  const igualAoPadrao = padrao && padrao.cbs === a.cbs && padrao.ibsUf === a.ibsUf && padrao.ibsMun === a.ibsMun;
  return {
    tributacao: {
      modo: 'reforma',
      ano,
      ...(igualAoPadrao ? {} : { aliquotas: { cbs: a.cbs, ibsUf: a.ibsUf, ibsMun: a.ibsMun } }),
    },
  };
}

function simplesNacional(simples: SimplesEmTexto): TributacaoDoFormulario {
  const rbt12 = lerNumero(simples.rbt12);
  const folha12 = lerNumero(simples.folha12);
  const pCBSSN = lerNumero(simples.pCBS);
  const pIBSSN = lerNumero(simples.pIBS);
  if (!rbt12 || rbt12 > LIMITE_RBT12)
    return { pendente: 'Informe a receita bruta dos últimos 12 meses (RBT12), de R$ 0,01 até R$ 4.800.000,00.' };
  const cbsInvalida = simples.pCBS && (pCBSSN === undefined || pCBSSN > LIMITE_ALIQUOTA);
  const ibsInvalido = simples.pIBS && (pIBSSN === undefined || pIBSSN > LIMITE_ALIQUOTA);
  if (cbsInvalida || ibsInvalido) return { pendente: 'Alíquotas de CBS e IBS do Simples devem estar entre 0 e 100.' };
  return {
    tributacao: {
      modo: 'simples',
      anexo: simples.anexo,
      rbt12,
      ano: simples.ano,
      ...(folha12 !== undefined ? { folha12 } : {}),
      ...(pCBSSN !== undefined ? { pCBSSN } : {}),
      ...(pIBSSN !== undefined ? { pIBSSN } : {}),
    },
  };
}

/** Tributação escolhida no formulário: regras atuais (sem entrada extra), Reforma Tributária ou Simples Nacional. */
export function tributacaoDoFormulario(
  modo: ModoTributacao,
  anoReforma: number,
  aliquotas: AliquotasEmTexto,
  simples: SimplesEmTexto,
): TributacaoDoFormulario {
  if (modo === 'reforma') return reforma(anoReforma, aliquotas);
  if (modo === 'simples') return simplesNacional(simples);
  return {};
}
