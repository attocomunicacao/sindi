import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PDFParse } from 'pdf-parse';
import { gerarDanfse } from '@/lib/danfse';

// Conformidade com o gerador oficial de DANFSe da Receita (calculadora-rtc-gerador-danfse, Go). O texto que o oficial produziu para cada XML fica gravado em
// tests/fixtures/rtc/danfse-casos.json (gerado por `npm run rtc:conferir:danfse -- --gravar`, que roda o oficial em WASM dentro do Node), então este teste roda
// na CI sem Go. O porte em TypeScript precisa dar o mesmo texto (campos, valores e ordem) e recusar o mesmo que o oficial recusa.
type Caso = {
  nome: string;
  opcoes: { stc?: 0 | 1 | 2; canhoto?: boolean };
  texto?: string[];
  recusado?: true;
};
const { casos, origem } = JSON.parse(readFileSync('tests/fixtures/rtc/danfse-casos.json', 'utf8')) as {
  casos: Caso[];
  origem: string;
};

async function textoDoPdf(pdf: Uint8Array) {
  const { pages } = await new PDFParse({ data: pdf.slice() }).getText();
  return pages.map((p) => p.text.replace(/\s+/g, ' ').trim());
}

test('conformidade DANFSe: as fixtures vêm do gerador oficial e cobrem situações, ambiente, blocos suprimidos, textos longos e XML inválido', () => {
  assert.match(origem, /Receita Federal/);
  assert.ok(casos.length >= 19);
  assert.ok(
    casos.some((c) => c.recusado),
    'há XML recusado pelo oficial',
  );
  assert.ok(
    casos.some((c) => c.texto?.[0].includes('CANCELADA')),
    'a marca d’água de cancelada está no texto oficial',
  );
  assert.ok(
    casos.every((c) => c.recusado || c.texto?.length === 1),
    'todo DANFSe válido cabe em uma página',
  );
});

for (const c of casos) {
  test(`conformidade DANFSe: ${c.nome} = texto do gerador oficial`, async () => {
    const xml = readFileSync(`tests/fixtures/rtc/danfse/${c.nome}.xml`, 'utf8');
    if (c.recusado) {
      await assert.rejects(() => gerarDanfse(xml, c.opcoes), 'o oficial recusa, o porte também');
      return;
    }
    assert.deepEqual(await textoDoPdf(await gerarDanfse(xml, c.opcoes)), c.texto);
  });
}
