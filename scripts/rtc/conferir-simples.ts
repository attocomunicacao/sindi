// Conformidade do CBS/IBS do Simples Nacional do SINDI com a calculadora oficial da Receita (calculadora-rtc-simples-nacional): roda os mesmos casos nos dois
// lados e aponta qualquer centavo de diferença. Com `--gravar`, grava as respostas oficiais em tests/fixtures/rtc/simples-nacional-casos.json, e é esse arquivo que
// o teste da CI confere (sem precisar de Java). Uso: npm run rtc:conferir:simples [-- --gravar] (serviço no ar: scripts/operacao/rtc-subir.ps1; endereço em
// SINDI_RTC_SIMPLES_URL, padrão http://127.0.0.1:8082/api).
import { writeFileSync } from 'node:fs';
import {
  calcularNoServicoSimples,
  calcularNoSindi,
  type AnexoServico,
  type EntradaSimplesOficial,
} from '@/lib/rtc/simples-nacional';

const BASE = (process.env.SINDI_RTC_SIMPLES_URL ?? 'http://127.0.0.1:8082/api').replace(/\/$/, '');
const RECEITAS = [50000, 12345.67, 0.01, 999999.99, 33.33, 250.5, 1234567.89];
const ANEXOS: AnexoServico[] = ['III', 'IV', 'V'];
// Pares distintos para o resultado mostrar qual par o serviço escolheu: com redistribuição do ISS e sem (o sem tem alíquota maior, como no PGDAS-D).
const COM = { cbs: 2.3874, ibs: 0.0263 };
const SEM = { cbs: 2.5, ibs: 0.03 };
const SITUACOES = [
  { nome: 'padrão', retido: false, semIss: false, isencao: false },
  { nome: 'ISS retido', retido: true, semIss: false, isencao: false },
  { nome: 'sem ISS', retido: false, semIss: true, isencao: false },
  { nome: 'isenção municipal', retido: false, semIss: false, isencao: true },
];

const casos: (EntradaSimplesOficial & { situacao: string })[] = ANEXOS.flatMap((anexo) =>
  SITUACOES.filter((s) => !(s.isencao && anexo === 'V')).flatMap(({ nome, ...fatos }) =>
    RECEITAS.map((receita) => ({
      receita,
      anexo,
      comRedistribuicao: COM,
      semRedistribuicao: SEM,
      ...fatos,
      situacao: nome,
    })),
  ),
);

const gravar = process.argv.includes('--gravar');
let divergencias = 0;
const fixtures: unknown[] = [];
for (const c of casos) {
  const { situacao, ...entrada } = c;
  try {
    const o = await calcularNoServicoSimples(entrada, BASE);
    const n = calcularNoSindi(entrada);
    const nosso = { vCBS: n.vCBS.toFixed(2), vIBS: n.vIBS.toFixed(2) };
    const oficial = { estado: o.estado, vCBS: o.vCBS.toFixed(2), vIBS: o.vIBS.toFixed(2) };
    const iguais = oficial.vCBS === nosso.vCBS && oficial.vIBS === nosso.vIBS;
    if (!iguais) divergencias++;
    console.log(
      `${iguais ? 'OK     ' : 'DIVERGE'} Anexo ${c.anexo} ${situacao} receita ${c.receita} par ${n.par} oficial ${JSON.stringify(oficial)} nosso ${JSON.stringify(nosso)}`,
    );
    fixtures.push({ ...entrada, situacao, par: n.par, oficial });
  } catch (e) {
    console.error(
      `FALHA  Anexo ${c.anexo} ${situacao} receita ${c.receita}: ${(e as Error).message} (o serviço está no ar em ${BASE}?)`,
    );
    process.exit(2);
  }
}
if (gravar && !divergencias) {
  writeFileSync(
    'tests/fixtures/rtc/simples-nacional-casos.json',
    JSON.stringify(
      {
        origem: 'calculadora-rtc-simples-nacional (Receita Federal, MIT)',
        versaoDoServico: process.env.SINDI_RTC_SIMPLES_VERSAO ?? '1.0.2',
        geradoEm: new Date().toISOString(),
        casos: fixtures,
      },
      null,
      2,
    ),
  );
  console.log('Fixtures gravadas em tests/fixtures/rtc/simples-nacional-casos.json');
}
console.log(
  `\n${casos.length - divergencias}/${casos.length} casos idênticos${divergencias ? ` · ${divergencias} divergências` : ''}`,
);
process.exit(divergencias ? 1 : 0);
