import { calcularDas, type Anexo, type ResultadoDas } from '../tributos/das';
import { brl, pontos } from '../tributos/formato';
import { calcularCbsIbsServico, transicaoDoAno, type AliquotasCbsIbs, type Transicao } from '../tributos/regime-regular';
import { calcularCbsIbsSimples, type ResultadoSimplesCbsIbs } from '../tributos/simples-cbs-ibs';

/**
 * Tributação do orçamento. `atual` mantém a conta de sempre (ISS, PIS, COFINS, CSLL, IRPJ por dentro do preço).
 * `reforma`: o preço continua "por dentro" com IRPJ/CSLL/BDI/lucro, PIS/COFINS só antes de 2027 e o ISS pelo fator da transição; a CBS e o IBS são "por fora",
 * somados ao valor da nota (o tomador no regime regular credita). `simples`: os tributos do preço são a alíquota efetiva do DAS.
 */
export type TributacaoEntrada =
  | { modo: 'atual' }
  | { modo: 'reforma'; ano: number; aliquotas?: AliquotasCbsIbs }
  | { modo: 'simples'; anexo: Anexo; rbt12: number; folha12?: number; ano?: number; pCBSSN?: number; pIBSSN?: number };

export type ImpostosAtuais = { iss: number; pis: number; cofins: number; contribuicaoSocial: number; irpj: number };
/** Taxas (fração do preço) de cada tributo do preço, na ordem em que entram na soma. */
export type PlanoTributario = {
  taxas: Record<string, number>;
  /** Fração do preço por tributo, para o detalhamento (CPP e demais ficam em `taxas`). */
  componentes: ImpostosAtuais;
  /** Linhas do grupo A dos encargos que não se pagam nesta tributação (Simples). */
  excluirEncargos: string[];
  finalizar: (valorContrato: number, ctx: { issMunicipal: number }) => ResultadoTributacao;
};
export type ResultadoTributacao = {
  modo: 'reforma' | 'simples'; rotulo: string; simulado: boolean; ano?: number;
  nota?: { valorServico: number; cbs: number; ibs: number; ibsUf: number; ibsMun: number; totalNota: number; informativo: boolean; aliquotas: AliquotasCbsIbs };
  transicao?: Transicao; das?: ResultadoDas; cbsIbsSimples?: ResultadoSimplesCbsIbs;
  encargosExcluidos: string[]; memoria: string[]; avisos: string[];
};

const TERCEIROS = ['SALÁRIO EDUCAÇÃO', 'SESC SESI', 'SENAC / SENAI', 'SEBRAE', 'INCRA'];
/** Contribuição patronal (CPP) e RAT, que ficam dentro do DAS nos Anexos III e V. */
const CPP_RAT = ['INSS', 'SAT'];

export function planejarTributacao(t: TributacaoEntrada | undefined, imp: ImpostosAtuais): PlanoTributario {
  const base = { ISS: imp.iss, PIS: imp.pis, COFINS: imp.cofins, 'Contribuição social': imp.contribuicaoSocial, IRPJ: imp.irpj };
  if (!t || t.modo === 'atual') return { taxas: base, componentes: imp, excluirEncargos: [], finalizar: () => { throw new Error('Tributação atual não tem bloco de detalhamento.'); } };

  if (t.modo === 'reforma') {
    const tr = transicaoDoAno(t.ano);
    const iss = imp.iss * tr.fatorIss; const pis = tr.pisCofins ? imp.pis : 0; const cofins = tr.pisCofins ? imp.cofins : 0;
    return {
      taxas: { ISS: iss, PIS: pis, COFINS: cofins, 'Contribuição social': imp.contribuicaoSocial, IRPJ: imp.irpj },
      componentes: { iss, pis, cofins, contribuicaoSocial: imp.contribuicaoSocial, irpj: imp.irpj }, excluirEncargos: [],
      finalizar: valorContrato => {
        const r = calcularCbsIbsServico({ base: Math.round(valorContrato * 100) / 100, ano: t.ano, servicoId: 'mao-de-obra', aliquotas: t.aliquotas });
        const total = r.informativo ? valorContrato : Math.round((valorContrato + r.total) * 100) / 100;
        const memoria = [
          `Ano ${t.ano}: PIS/COFINS ${tr.pisCofins ? 'ainda existem' : 'deixam de existir (CBS/IBS os substituem)'}; ISS a ${pontos(tr.fatorIss * 100, 0, 0)} da alíquota do município (${pontos(imp.iss * 100, 2, 2)} → ${pontos(iss * 100, 2, 2)}); IRPJ e CSLL continuam.`,
          `Preço "por dentro" (custo ÷ (1 − tributos, BDI e lucro)): ${brl(valorContrato)}. Esse é o valor do serviço na nota.`,
          ...r.memoria,
          r.informativo ? `Total da nota: ${brl(total)} (CBS/IBS de 2026 destacados, sem custo).` : `Total da nota = ${brl(valorContrato)} + CBS ${brl(r.vCBS)} + IBS ${brl(r.vIBS)} = ${brl(total)}.`,
        ];
        const avisos = [...r.avisos, 'O tomador no regime regular credita a CBS e o IBS destacados; para ele o custo do serviço é o valor do serviço. Quem não credita (por exemplo, optante do Simples ou consumidor final) paga o total da nota.',
          'Transição (PIS/COFINS em 2027, ISS escalonado até 2033): padrão da LC 214/2025, CONFERIR com a legislação vigente antes de uso comercial. Para o setor foi usado o serviço LC 116 17.05 (cessão de mão de obra), CST 000.'];
        return { modo: 'reforma', rotulo: `Reforma Tributária (${t.ano})${r.simulado ? ' · simulado' : ''}`, simulado: r.simulado, ano: t.ano, transicao: tr,
          nota: { valorServico: valorContrato, cbs: r.vCBS, ibs: r.vIBS, ibsUf: r.vIBSUF, ibsMun: r.vIBSMun, totalNota: total, informativo: r.informativo, aliquotas: r.aliquotas }, encargosExcluidos: [], memoria, avisos };
      },
    };
  }

  // Simples Nacional: a alíquota efetiva do DAS substitui ISS, PIS, COFINS, CSLL e IRPJ (e, nos Anexos III e V, a CPP e o RAT).
  const das0 = calcularDas({ anexo: t.anexo, rbt12: t.rbt12, folha12: t.folha12, ano: t.ano });
  const efetiva = das0.aliquotaEfetiva / 100;
  const parte = (n: string) => (das0.partilha.find(p => p.tributo === n)?.aliquota ?? 0) / 100;
  const taxas: Record<string, number> = { 'DAS (Simples Nacional)': efetiva };
  if (das0.issForaDoDas) taxas['ISS (fora do DAS)'] = imp.iss;
  const excluirEncargos = das0.anexoAplicado === 'IV' ? [...TERCEIROS] : [...CPP_RAT, ...TERCEIROS];
  return {
    taxas, excluirEncargos,
    componentes: { iss: das0.issForaDoDas ? imp.iss : parte('ISS'), pis: parte('PIS'), cofins: parte('Cofins'), contribuicaoSocial: parte('CSLL'), irpj: parte('IRPJ') },
    finalizar: (valorContrato, ctx) => {
      const das = calcularDas({ anexo: t.anexo, rbt12: t.rbt12, folha12: t.folha12, receitaMes: Math.round(valorContrato * 100) / 100, ano: t.ano });
      const temPar = t.pCBSSN !== undefined || t.pIBSSN !== undefined;
      const cbsIbsSimples = temPar ? calcularCbsIbsSimples({ receita: Math.round(valorContrato * 100) / 100, pCBSSN: t.pCBSSN ?? 0, pIBSSN: t.pIBSSN ?? 0 }) : undefined;
      const memoria = [
        `DAS: alíquota efetiva do Anexo ${das.anexoAplicado} (${das.faixa}ª faixa) de ${pontos(das.aliquotaEfetiva, 2, 4)} sobre o preço "por dentro" de ${brl(valorContrato)} = ${brl(das.valorDas ?? 0)}.`,
        ...das.memoria,
        das.cppForaDoDas ? 'Encargos: a CPP patronal (20%) e o RAT permanecem nos encargos (fora do DAS); contribuições a terceiros (Sistema S) foram retiradas.'
          : 'Encargos: INSS patronal, RAT e terceiros foram retirados dos encargos (a CPP está no DAS e não há terceiros no Simples).',
        ...(das.issForaDoDas ? [`ISS fora do DAS (6ª faixa): ${pontos(ctx.issMunicipal * 100, 2, 2)} do preço, somado aos tributos.`] : []),
        ...(cbsIbsSimples ? cbsIbsSimples.memoria : []),
      ];
      const avisos = [...das.avisos, ...(cbsIbsSimples ? ['CBS/IBS do Simples são destacados na nota e já estão dentro do DAS: não somam ao preço.', ...cbsIbsSimples.avisos] : []),
        'A RBT12 e a folha são da empresa prestadora, não do contrato. O Fator R e a faixa dependem do seu histórico real.'];
      return { modo: 'simples', rotulo: `Simples Nacional · Anexo ${das.anexoAplicado}${das.fatorR.trocouParaIII ? ' (Fator R)' : ''}`, simulado: (t.ano ?? 0) >= 2027 && temPar, ano: t.ano, das, cbsIbsSimples,
        encargosExcluidos: excluirEncargos, memoria, avisos };
    },
  };
}
