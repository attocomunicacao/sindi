// Roda, em sequência, as quatro conferências do SINDI com as calculadoras oficiais da Receita Federal: regime regular (CBS/IBS), Simples Nacional, catálogo de serviços e
// DANFSe. Os argumentos (por exemplo `--gravar`, que regrava as fixtures que a CI confere) seguem para cada uma; a do catálogo só lê e ignora `--gravar`.
// Uso: npm run rtc:conferir [-- --gravar]. Saída: 0 tudo conferido, 1 alguma divergência, 2 algum serviço oficial fora do ar (sem divergência nas demais).
// Serviços: Java nas portas 8081 e 8082 (scripts/operacao/rtc-subir.ps1) e o DANFSe oficial em WASM (scripts/operacao/rtc-instalar.ps1).
import { spawnSync } from 'node:child_process';

const ETAPAS = [
  { nome: 'regime regular (CBS/IBS)', arquivo: 'conferir.ts' },
  { nome: 'Simples Nacional', arquivo: 'conferir-simples.ts' },
  { nome: 'catálogo de serviços e alíquotas de 2026', arquivo: 'conferir-catalogo.ts' },
  { nome: 'DANFSe', arquivo: 'conferir-danfse.ts' },
];
const repassados = process.argv.slice(2);

const resultados = ETAPAS.map((etapa) => {
  console.log(`\n=== ${etapa.nome} ===`);
  const r = spawnSync('npx', ['tsx', `scripts/rtc/${etapa.arquivo}`, ...repassados], { stdio: 'inherit', shell: true });
  return { ...etapa, codigo: r.status ?? 2 };
});

const rotulo = (codigo: number) =>
  codigo === 0 ? 'conferido' : codigo === 1 ? 'DIVERGE' : 'serviço oficial fora do ar';
console.log('\n=== Resumo ===');
for (const r of resultados) console.log(`${r.codigo === 0 ? 'OK     ' : 'FALHA  '} ${r.nome}: ${rotulo(r.codigo)}`);
process.exit(resultados.some((r) => r.codigo === 1) ? 1 : resultados.some((r) => r.codigo !== 0) ? 2 : 0);
