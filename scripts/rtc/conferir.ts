// Conformidade da calculadora de CBS/IBS do SINDI com a calculadora oficial da Receita (calculadora-rtc-regime-regular): roda os mesmos casos nos dois lados e
// aponta qualquer centavo de diferença. Cobre os serviços do catálogo (src/lib/tributos/servicos.ts, inclusive o de redução de 30%), 2026 (alíquotas oficiais) e
// 2027–2033 (alíquotas informadas, cálculo simulado) e alguns municípios (a conta não depende deles, e isto prova). Passa pelo mesmo cliente que o site usa
// (src/lib/rtc/regime-geral.ts), então confere também o corpo enviado e a leitura da resposta.
// Com `--gravar`, grava as respostas oficiais em tests/fixtures/rtc/regime-geral-casos.json, e é esse arquivo que o teste da CI confere (sem precisar de Java).
// Uso: npm run rtc:conferir:regime [-- --gravar] (ou npm run rtc:conferir, que roda todas as conferências RTC) (serviço no ar: scripts/operacao/rtc-subir.ps1; endereço em SINDI_RTC_REGIME_URL, padrão http://127.0.0.1:8081/api).
import { writeFileSync } from 'node:fs';
import { calcularNoServicoOficial } from '@/lib/rtc/regime-geral';
import { calcularCbsIbsServico, type AliquotasCbsIbs } from '@/lib/tributos/regime-regular';
import { SERVICOS } from '@/lib/tributos/servicos';

const BASE = (process.env.SINDI_RTC_REGIME_URL ?? 'http://127.0.0.1:8081/api').replace(/\/$/, '');
const BASES = [100000, 12345.67, 0.01, 999999.99, 1234567.89, 33.33, 5000.5, 250.5];
const ALIQUOTAS: Record<number, AliquotasCbsIbs> = {
  2027: { cbs: 8.4, ibsUf: 0.05, ibsMun: 0.05 },
  2029: { cbs: 8.5, ibsUf: 1.6, ibsMun: 0.25 },
  2033: { cbs: 8.5, ibsUf: 16, ibsMun: 2.5 },
};
// São Paulo leva todas as bases; os demais, só duas (a conta não muda com o município, então bastam para provar).
const MUNICIPIOS = [
  { municipio: 3550308, uf: 'SP', bases: BASES },
  { municipio: 3304557, uf: 'RJ', bases: BASES.slice(0, 2) },
  { municipio: 4314902, uf: 'RS', bases: BASES.slice(0, 2) },
];

type Caso = {
  servicoId: string;
  ano: number;
  base: number;
  municipio: number;
  uf: string;
  aliquotas?: { cbs: number; ibsEstadual: number; ibsMunicipal: number };
};
const casos: Caso[] = SERVICOS.flatMap((s) =>
  MUNICIPIOS.flatMap(({ municipio, uf, bases }) =>
    bases.flatMap((base) => [
      { servicoId: s.id, ano: 2026, base, municipio, uf },
      ...Object.entries(ALIQUOTAS).map(([ano, a]) => ({
        servicoId: s.id,
        ano: Number(ano),
        base,
        municipio,
        uf,
        aliquotas: { cbs: a.cbs, ibsEstadual: a.ibsUf, ibsMunicipal: a.ibsMun },
      })),
    ]),
  ),
);

const doCaso = (c: Caso) => ({
  ano: c.ano,
  base: c.base,
  servicoId: c.servicoId,
  municipio: c.municipio,
  uf: c.uf,
  ...(c.aliquotas
    ? { aliquotas: { cbs: c.aliquotas.cbs, ibsUf: c.aliquotas.ibsEstadual, ibsMun: c.aliquotas.ibsMunicipal } }
    : {}),
});

const duas = (n: number) => n.toFixed(2);
async function versaoDoServico() {
  if (process.env.SINDI_RTC_VERSAO) return process.env.SINDI_RTC_VERSAO;
  try {
    const r = await fetch(`${BASE}/calculadora/dados-abertos/versao`, { signal: AbortSignal.timeout(8000) });
    return ((await r.json()) as { versaoApp?: string }).versaoApp ?? 'desconhecida';
  } catch {
    return 'desconhecida';
  }
}

const gravar = process.argv.includes('--gravar');
let divergencias = 0;
const fixtures: unknown[] = [];
for (const c of casos) {
  try {
    const o = await calcularNoServicoOficial(doCaso(c), BASE);
    const r = calcularCbsIbsServico(doCaso(c));
    const oficial = {
      estado: o.estado,
      vCBS: duas(o.vCBS),
      vIBSUF: duas(o.vIBSUF),
      vIBSMun: duas(o.vIBSMun),
      vIBS: duas(o.vIBS),
    };
    const nosso = { vCBS: duas(r.vCBS), vIBSUF: duas(r.vIBSUF), vIBSMun: duas(r.vIBSMun), vIBS: duas(r.vIBS) };
    const iguais =
      oficial.vCBS === nosso.vCBS &&
      oficial.vIBSUF === nosso.vIBSUF &&
      oficial.vIBSMun === nosso.vIBSMun &&
      oficial.vIBS === nosso.vIBS &&
      (oficial.estado === 'CALCULO_SIMULADO') === r.simulado;
    if (!iguais) divergencias++;
    console.log(
      `${iguais ? 'OK     ' : 'DIVERGE'} ${c.servicoId} ${c.uf} ${c.ano} base ${c.base} oficial ${JSON.stringify(oficial)} nosso ${JSON.stringify(nosso)}`,
    );
    fixtures.push({ ...c, oficial });
  } catch (e) {
    console.error(
      `FALHA  ${c.servicoId} ${c.ano} base ${c.base}: ${(e as Error).message} (o serviço está no ar em ${BASE}?)`,
    );
    process.exit(2);
  }
}
if (gravar && !divergencias) {
  writeFileSync(
    'tests/fixtures/rtc/regime-geral-casos.json',
    JSON.stringify(
      {
        origem: 'calculadora-rtc-regime-regular (Receita Federal, MIT)',
        versaoDoServico: await versaoDoServico(),
        geradoEm: new Date().toISOString(),
        casos: fixtures,
      },
      null,
      2,
    ),
  );
  console.log('Fixtures gravadas em tests/fixtures/rtc/regime-geral-casos.json');
}
console.log(
  `\n${casos.length - divergencias}/${casos.length} casos idênticos${divergencias ? ` · ${divergencias} divergências` : ''}`,
);
process.exit(divergencias ? 1 : 0);
