// Confere o catálogo de serviços do SINDI (src/lib/tributos/servicos.ts) e as alíquotas de 2026 com os dados abertos da calculadora oficial da Receita
// (calculadora-rtc-regime-regular, GET /calculadora/dados-abertos/...): cada NBS existe e é aplicável ao cClassTrib do serviço, o CST e o cClassTrib existem, a
// classificação vale para NFS-e (tipo 91), a redução do catálogo é a da Receita e as alíquotas de 2026 (União, UF, município) são as do banco oficial.
// Só leitura. Uso: npm run rtc:catalogo (serviço no ar: scripts/operacao/rtc-subir.ps1; endereço em SINDI_RTC_REGIME_URL, padrão http://127.0.0.1:8081/api).
// Saída: 0 tudo conferido, 1 divergência, 2 serviço fora do ar.
import { ALIQUOTAS_2026 } from '@/lib/tributos/regime-regular';
import { SERVICOS } from '@/lib/tributos/servicos';

const BASE = `${(process.env.SINDI_RTC_REGIME_URL ?? 'http://127.0.0.1:8081/api').replace(/\/$/, '')}/calculadora/dados-abertos`;
// Fatos de 2026: a Receita só publica as alíquotas desse ano, e a vigência das classificações é checada na mesma data.
const DATA = '2026-06-10';
const SAO_PAULO = { uf: 35, municipio: 3550308 };
const TIPO_NFSE = 91;

class ForaDoAr extends Error {}
async function obter<T>(caminho: string): Promise<{ status: number; corpo: T }> {
  try {
    const r = await fetch(`${BASE}/${caminho}`, { signal: AbortSignal.timeout(10_000) });
    return { status: r.status, corpo: (await r.json()) as T };
  } catch (e) {
    throw new ForaDoAr((e as Error).message);
  }
}

let divergencias = 0;
const confere = (ok: boolean, texto: string) => {
  if (!ok) divergencias++;
  console.log(`${ok ? 'OK     ' : 'DIVERGE'} ${texto}`);
};

type Classificacao = {
  descricao?: string;
  percentualReducaoCbs?: number;
  percentualReducaoIbsUf?: number;
  percentualReducaoIbsMun?: number;
  tiposDfeClassificacao?: { tipo?: number }[];
};

async function conferirServico(servico: (typeof SERVICOS)[number]) {
  const classif = await obter<Classificacao>(
    `classificacoes-tributarias/cbs-ibs/class-trib/${servico.cClassTrib}?data=${DATA}`,
  );
  const c = classif.corpo;
  confere(
    classif.status === 200,
    `${servico.id}: cClassTrib ${servico.cClassTrib} existe (${c.descricao ?? 'sem descrição'})`,
  );
  if (classif.status !== 200) return;
  const reducoes = [c.percentualReducaoCbs, c.percentualReducaoIbsUf, c.percentualReducaoIbsMun];
  confere(
    reducoes.every((r) => r === servico.reducaoPct),
    `${servico.id}: redução do catálogo ${servico.reducaoPct}% = oficial CBS/IBS UF/IBS município ${reducoes.join('/')}%`,
  );
  confere(
    c.tiposDfeClassificacao?.some((t) => t.tipo === TIPO_NFSE) === true,
    `${servico.id}: cClassTrib ${servico.cClassTrib} vale para NFS-e (tipo ${TIPO_NFSE})`,
  );
  const doCst = await obter<{ codigo?: string }[]>(`classificacoes-tributarias/cbs-ibs/${servico.cst}?data=${DATA}`);
  confere(
    doCst.status === 200 && Array.isArray(doCst.corpo) && doCst.corpo.some((x) => x.codigo === servico.cClassTrib),
    `${servico.id}: cClassTrib ${servico.cClassTrib} pertence ao CST ${servico.cst}`,
  );
  for (const nbs of servico.nbs) {
    const existe = await obter<{ item?: string }>(`nbs?nbs=${nbs}&data=${DATA}`);
    confere(existe.status === 200, `${servico.id}: NBS ${nbs} existe (${existe.corpo.item ?? 'não encontrada'})`);
    const aplicavel = await obter<{ valido?: boolean }>(
      `classificacoes-tributarias/nbs-aplicavel?cClassTrib=${servico.cClassTrib}&nbs=${nbs}&dataOcorrenciaFatoGerador=${DATA}`,
    );
    confere(
      aplicavel.corpo.valido === true,
      `${servico.id}: NBS ${nbs} é aplicável ao cClassTrib ${servico.cClassTrib}`,
    );
  }
}

async function conferirAliquotas() {
  const uniao = await obter<{ aliquotaReferencia?: number }>(`aliquota-uniao?data=${DATA}`);
  const uf = await obter<{ aliquotaReferencia?: number }>(`aliquota-uf?codigoUf=${SAO_PAULO.uf}&data=${DATA}`);
  const mun = await obter<{ aliquotaReferencia?: number }>(
    `aliquota-municipio?codigoMunicipio=${SAO_PAULO.municipio}&data=${DATA}`,
  );
  confere(
    uniao.corpo.aliquotaReferencia === ALIQUOTAS_2026.cbs,
    `2026: CBS ${ALIQUOTAS_2026.cbs} = oficial ${uniao.corpo.aliquotaReferencia}`,
  );
  confere(
    uf.corpo.aliquotaReferencia === ALIQUOTAS_2026.ibsUf,
    `2026: IBS UF ${ALIQUOTAS_2026.ibsUf} = oficial ${uf.corpo.aliquotaReferencia}`,
  );
  confere(
    mun.corpo.aliquotaReferencia === ALIQUOTAS_2026.ibsMun,
    `2026: IBS município ${ALIQUOTAS_2026.ibsMun} = oficial ${mun.corpo.aliquotaReferencia}`,
  );
  // Os anos seguintes não têm tabela oficial: a Receita responde 404, e é isso que mantém o cálculo deles como "simulado".
  const depois = await obter<unknown>(`aliquota-uniao?data=2027-06-10`);
  confere(
    depois.status === 404,
    `2027: sem alíquota oficial publicada (HTTP ${depois.status}); o cálculo segue simulado`,
  );
}

try {
  for (const s of SERVICOS) await conferirServico(s);
  await conferirAliquotas();
} catch (e) {
  if (!(e instanceof ForaDoAr)) throw e;
  console.error(`FALHA  o serviço não respondeu em ${BASE}: ${e.message}`);
  process.exit(2);
}
console.log(divergencias ? `\n${divergencias} divergências` : '\nCatálogo e alíquotas de 2026 conferem com a Receita.');
process.exit(divergencias ? 1 : 0);
