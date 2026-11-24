import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gerarDanfse } from '@/lib/danfse';
import { lerNFSe } from '@/lib/danfse/leitura';
import { POST as danfse } from '@/app/api/danfse/route';
import { reiniciarLimitesNaMemoria } from '@/lib/infra/limite-por-minuto';

const XML = readFileSync(new URL('../fixtures/nfse-exemplo.xml', import.meta.url), 'utf8');
const nota = (miolo: string) => `<NFSe><infNFSe Id="NFS1">${miolo}</infNFSe></NFSe>`;

test('XML hostil: bilhão de risadas e XXE são recusados antes de qualquer expansão', () => {
  const risadas =
    '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]><NFSe><infNFSe Id="a"><nNFSe>&lol2;</nNFSe></infNFSe></NFSe>';
  const xxe =
    '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><NFSe><infNFSe Id="a"><nNFSe>&xxe;</nNFSe></infNFSe></NFSe>';
  const parametro = '<!DOCTYPE foo [<!ENTITY % p SYSTEM "http://127.0.0.1:1/x.dtd">%p;]><NFSe><infNFSe Id="a"/></NFSe>';
  const minuscula = '<!doctype foo><NFSe><infNFSe Id="a"/></NFSe>';
  const espaco = '<!  DOCTYPE foo><NFSe><infNFSe Id="a"/></NFSe>';
  for (const xml of [risadas, xxe, parametro, minuscula, espaco]) assert.throws(() => lerNFSe(xml), /DTD|malformado/);
});

test('XML hostil: entidade não declarada ou numérica inválida não é expandida nem vira conteúdo', () => {
  const inf = lerNFSe(nota('<nNFSe>&xxe;</nNFSe>'));
  assert.ok(!inf.nNFSe.includes('root:'));
  const nula = lerNFSe(nota('<nNFSe>&#0;&#xD800;&#x110000;</nNFSe>'));
  assert.equal(nula.nNFSe, '&#0;&#xD800;&#x110000;');
});

test('XML hostil: nomes que imitam propriedades de Object não poluem nem quebram a leitura', () => {
  const xml = nota(
    '<__proto__><polluted>sim</polluted></__proto__><constructor><prototype><polluted>sim</polluted></prototype></constructor><nNFSe>7</nNFSe>',
  );
  try {
    assert.equal(lerNFSe(xml).nNFSe, '7');
  } catch (e) {
    assert.match((e as Error).message, /XML/);
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  const trib = lerNFSe(
    nota('<DPS><infDPS><valores><trib><tribMun><tribISSQN>1</tribISSQN></tribMun></trib></valores></infDPS></DPS>'),
  );
  assert.equal(trib.dps.valores.tribMun?.tribISSQN, 1);
});

test('XML hostil: números inválidos, gigantes ou em notação estranha viram erro claro', () => {
  for (const v of ['abc', '1e999', '9'.repeat(40), '0x10', 'NaN', 'Infinity', '1,5']) {
    assert.throws(() => lerNFSe(nota(`<valores><vLiq>${v}</vLiq></valores>`)), /valor|numérico|limite/, v);
  }
  assert.throws(() => lerNFSe(nota('<DPS><infDPS><tpEmit>99999999999</tpEmit></infDPS></DPS>')), /inteiro/);
});

test('XML hostil: aninhamento muito profundo e milhares de elementos não derrubam o processo', () => {
  const fundo = `<NFSe><infNFSe Id="a">${'<a>'.repeat(50000)}${'</a>'.repeat(50000)}</infNFSe></NFSe>`;
  try {
    lerNFSe(fundo);
  } catch (e) {
    assert.ok(e instanceof Error);
  }
  const largo = nota(Array.from({ length: 20000 }, (_, i) => `<x${i % 7}>${i}</x${i % 7}>`).join(''));
  assert.equal(lerNFSe(largo).id, 'NFS1');
});

test('XML hostil: BOM, CDATA, comentários, instruções e tags trocadas', () => {
  assert.equal(lerNFSe('﻿' + XML).nNFSe, '12');
  assert.equal(lerNFSe(nota('<nNFSe><![CDATA[<b>1</b>]]></nNFSe>')).nNFSe.includes('<b>'), true);
  assert.equal(lerNFSe(nota('<!-- <nNFSe>9</nNFSe> --><nNFSe>3</nNFSe><?pi x?>')).nNFSe, '3');
  assert.throws(() => lerNFSe('<NFSe><infNFSe Id="a"></NFSe></infNFSe>'), /malformado/);
  assert.throws(() => lerNFSe('\u0000<NFSe/>'), /XML/);
});

test('XML hostil: texto com HTML, escapes de PDF e controles sai no PDF só como texto', async () => {
  const perigoso = '<xNome>&lt;script&gt;alert(1)&lt;/script&gt; ) Tj /Pwn (x \\) &#7; ‮</xNome>';
  const xml = XML.replace('<xNome>Prestadora de Serviços Exemplo Ltda</xNome>', perigoso);
  const bytes = await gerarDanfse(xml);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  const bruto = new TextDecoder('latin1').decode(bytes);
  assert.ok(
    !bruto.includes('/JavaScript') &&
      !bruto.includes('/OpenAction') &&
      !bruto.includes('/Launch') &&
      !bruto.includes('/URI'),
  );
});

test('XML hostil: texto gigante em um campo é cortado e a geração termina em tempo razoável', async () => {
  const xml = XML.replace(
    '<xNome>Prestadora de Serviços Exemplo Ltda</xNome>',
    `<xNome>${'W'.repeat(2_000_000)}</xNome>`,
  );
  const inicio = Date.now();
  const bytes = await gerarDanfse(xml);
  assert.ok(bytes.length < 1_000_000);
  assert.ok(Date.now() - inicio < 10_000);
});

test('rota: XML hostil também é barrado pela API, sem 5xx', async () => {
  reiniciarLimitesNaMemoria();
  const enviar = (xml: string) =>
    danfse(
      new Request('http://localhost/api/danfse', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ xml }),
      }),
    );
  for (const xml of [
    '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><NFSe><infNFSe Id="a">&x;</infNFSe></NFSe>',
    `<NFSe><infNFSe Id="a">${'<a>'.repeat(50000)}`,
    '\u0000\u0001',
    '<NFSe><infNFSe Id="a"><valores><vLiq>1e999</vLiq></valores></infNFSe></NFSe>',
  ]) {
    const r = await enviar(xml);
    assert.equal(r.status, 400, xml.slice(0, 30));
  }
  reiniciarLimitesNaMemoria();
});
