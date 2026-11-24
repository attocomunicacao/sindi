// Conformidade do DANFSe do SINDI (porte em TypeScript, src/lib/danfse) com o gerador oficial da Receita (calculadora-rtc-gerador-danfse, Go). O oficial roda dentro do
// Node pelo alvo WASM do próprio repositório (scripts/rtc/danfse-oficial.ts); cada XML passa pelos dois e o TEXTO extraído dos PDFs precisa ser idêntico (campos,
// valores e ordem; os bytes mudam porque cada lado usa uma biblioteca de PDF diferente). XML inválido tem de ser recusado pelos dois.
// Com `--gravar`, grava os XMLs e o texto oficial em tests/fixtures/rtc/danfse/, e é esse conjunto que o teste da CI confere (sem precisar de Go).
// Uso: npm run rtc:conferir:danfse [-- --gravar]. Saída: 0 tudo idêntico, 1 divergência, 2 oficial indisponível.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gerarDanfse } from '@/lib/danfse';
import { carregarOficial, OficialIndisponivel, textoDoPdf, type OpcoesOficial } from './danfse-oficial';

const XML = readFileSync('tests/fixtures/nfse-exemplo.xml', 'utf8');
const mutar = (de: string, para: string) => {
  if (!XML.includes(de)) throw new Error(`a fixture não tem ${de}`);
  return XML.replace(de, para);
};
const longo = 'Serviço de manutenção predial com muitas palavras repetidas. '.repeat(200);
const MINIMO =
  '<NFSe><infNFSe Id="NFS123"><nNFSe>1</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Teste</xDescServ></cServ></serv></infDPS></DPS><emit><CNPJ>12345678000195</CNPJ></emit></infNFSe></NFSe>';

type Caso = { nome: string; xml: string; opcoes?: OpcoesOficial; invalido?: boolean };
const CASOS: Caso[] = [
  { nome: 'base-com-canhoto', xml: XML },
  { nome: 'base-sem-canhoto', xml: XML, opcoes: { canhoto: false } },
  { nome: 'substituida', xml: XML, opcoes: { stc: 1 } },
  { nome: 'cancelada', xml: XML, opcoes: { stc: 2 } },
  { nome: 'homologacao', xml: mutar('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>') },
  {
    nome: 'competencia-2027-sem-pis-cofins',
    xml: mutar('<dCompet>2026-07-14</dCompet>', '<dCompet>2027-07-14</dCompet>'),
  },
  { nome: 'optante-simples', xml: mutar('<opSimpNac>1</opSimpNac>', '<opSimpNac>3</opSimpNac>') },
  { nome: 'sem-aliquota-iss', xml: mutar('<pAliqAplic>5.00</pAliqAplic>', '') },
  { nome: 'sem-ibscbs', xml: XML.replace(/<IBSCBS>[\s\S]*?<\/IBSCBS>/g, '') },
  { nome: 'sem-tributacao-municipal', xml: XML.replace(/<tribMun>[\s\S]*?<\/tribMun>/, '') },
  {
    nome: 'caracteres-fora-do-latin1',
    xml: mutar('<xNome>Prestadora de Serviços Exemplo Ltda</xNome>', '<xNome>Empresa 😀 日本語 Ltda</xNome>'),
  },
  { nome: 'descricao-enorme', xml: XML.replace(/<xDescServ>.*<\/xDescServ>/, `<xDescServ>${longo}</xDescServ>`) },
  {
    nome: 'complementares-enormes',
    xml: mutar('<xInfComp>Pagamento em até 30 dias.</xInfComp>', `<xInfComp>${longo}</xInfComp>`),
  },
  { nome: 'minimo', xml: MINIMO },
  { nome: 'invalido-vazio', xml: '', invalido: true },
  { nome: 'invalido-nao-e-xml', xml: 'isto não é xml', invalido: true },
  { nome: 'invalido-raiz-errada', xml: '<Outra><infNFSe Id="a"/></Outra>', invalido: true },
  { nome: 'invalido-sem-id', xml: '<NFSe><infNFSe/></NFSe>', invalido: true },
  {
    nome: 'invalido-doctype',
    xml: '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY b "c">]><NFSe><infNFSe Id="a"/></NFSe>',
    invalido: true,
  },
];

type Resultado = { texto: string[] } | { recusado: true };
async function nosso(c: Caso): Promise<Resultado> {
  try {
    return { texto: await textoDoPdf(await gerarDanfse(c.xml, c.opcoes)) };
  } catch {
    return { recusado: true };
  }
}

const gravar = process.argv.includes('--gravar');
let oficial: Awaited<ReturnType<typeof carregarOficial>>;
try {
  oficial = await carregarOficial();
} catch (e) {
  if (!(e instanceof OficialIndisponivel)) throw e;
  console.error(`FALHA  gerador oficial indisponível: ${e.message} (rode scripts/operacao/rtc-instalar.ps1)`);
  process.exit(2);
}

let divergencias = 0;
const gravados: unknown[] = [];
for (const c of CASOS) {
  let doOficial: Resultado;
  try {
    doOficial = { texto: await textoDoPdf(oficial(c.xml, c.opcoes)) };
  } catch {
    doOficial = { recusado: true };
  }
  const doNosso = await nosso(c);
  const iguais = JSON.stringify(doOficial) === JSON.stringify(doNosso) && 'recusado' in doOficial === !!c.invalido;
  if (!iguais) divergencias++;
  const resumo = (r: typeof doOficial) =>
    'recusado' in r ? 'recusado' : `${r.texto.length} pág., ${r.texto.join('').length} caracteres`;
  console.log(`${iguais ? 'OK     ' : 'DIVERGE'} ${c.nome}: oficial ${resumo(doOficial)} · nosso ${resumo(doNosso)}`);
  if (!iguais && 'texto' in doOficial && 'texto' in doNosso) {
    const [a, b] = [doOficial.texto.join('\n'), doNosso.texto.join('\n')];
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    console.log(
      `          primeira diferença na posição ${i}:\n          oficial …${a.slice(Math.max(0, i - 40), i + 80)}\n          nosso   …${b.slice(Math.max(0, i - 40), i + 80)}`,
    );
  }
  gravados.push({ nome: c.nome, opcoes: c.opcoes ?? {}, ...doOficial });
}

if (gravar && !divergencias) {
  mkdirSync('tests/fixtures/rtc/danfse', { recursive: true });
  for (const c of CASOS) writeFileSync(`tests/fixtures/rtc/danfse/${c.nome}.xml`, c.xml);
  writeFileSync(
    'tests/fixtures/rtc/danfse-casos.json',
    JSON.stringify(
      {
        origem: 'calculadora-rtc-gerador-danfse (Receita Federal, MIT), alvo WASM',
        geradoEm: new Date().toISOString(),
        casos: gravados,
      },
      null,
      2,
    ),
  );
  console.log('Fixtures gravadas em tests/fixtures/rtc/danfse-casos.json e tests/fixtures/rtc/danfse/');
}
console.log(
  `\n${CASOS.length - divergencias}/${CASOS.length} casos idênticos${divergencias ? ` · ${divergencias} divergências` : ''}`,
);
process.exit(divergencias ? 1 : 0);
