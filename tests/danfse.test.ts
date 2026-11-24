import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { gerarDanfse, ErroDanfse } from '@/lib/danfse';
import { lerNFSe, repararEcomercial } from '@/lib/danfse/leitura';
import { apresentar, prepararNFSe, exibirPisCofins, montarLinhaTotaisTributos } from '@/lib/danfse/apresentacao';
import * as f from '@/lib/danfse/formato';
import { resolverMunicipio } from '@/lib/danfse/localidades';
import { calcularAlocacaoTexto, montarLayoutPagina } from '@/lib/danfse/pdf';

const XML = readFileSync(new URL('./fixtures/nfse-exemplo.xml', import.meta.url), 'utf8');
const texto = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const mutar = (de: string, para: string) => { assert.ok(XML.includes(de), `fixture sem ${de}`); return XML.replace(de, para); };

test('leitura: lê a fixture pelos nomes locais (namespace ignorado) e mantém gItemPed como lista', () => {
  const inf = lerNFSe(XML);
  assert.equal(inf.id, 'NFS35503082112345678000195000000000000126070000000001');
  assert.equal(inf.nNFSe, '12'); assert.equal(inf.emit.cnpj, '12345678000195'); assert.equal(inf.dps.valores.vServ, 1000);
  assert.deepEqual(inf.dps.serv.infoCompl.itensPed, ['Item A', 'Item B']);
  assert.equal(inf.dps.toma?.xNome, 'Condomínio Edifício Central & Filhos', 'entidade &amp; decodificada');
  assert.equal(inf.ibscbs?.vTotNF, 1000); assert.equal(inf.dps.ibscbs?.cClassTrib, '000001');
});

test('leitura: um único gItemPed também vira lista; prefixo de namespace é ignorado', () => {
  const um = XML.replace('<gItemPed><xItemPed>Item B</xItemPed></gItemPed>', '');
  assert.deepEqual(lerNFSe(um).dps.serv.infoCompl.itensPed, ['Item A']);
  const prefixado = XML.replace('<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"', '<n:NFSe xmlns:n="http://www.sped.fazenda.gov.br/nfse"').replace('</NFSe>', '</n:NFSe>').replace('<infNFSe ', '<n:infNFSe ').replace('</infNFSe>', '</n:infNFSe>');
  assert.equal(lerNFSe(prefixado).nNFSe, '12');
});

test('leitura: alíquota ausente não é 0,00%, e elemento vazio vale zero', () => {
  const inf = lerNFSe(mutar('<pAliqAplic>5.00</pAliqAplic>', ''));
  assert.equal(inf.valores.pAliqAplic, undefined);
  assert.equal(apresentar(prepararNFSe(inf, 'valida')).municipal.aliqAplic, '-');
  assert.equal(lerNFSe(mutar('<pAliqAplic>5.00</pAliqAplic>', '<pAliqAplic/>')).valores.pAliqAplic, 0);
  assert.equal(lerNFSe(XML).ibscbs?.pRedAliqUF, undefined);
});

test('leitura: rejeita vazio, grande demais, DOCTYPE/ENTITY, raiz errada, sem Id e XML malformado', () => {
  assert.throws(() => lerNFSe('   '), /vazio/);
  assert.throws(() => lerNFSe(`<NFSe>${'a'.repeat(5 * 1024 * 1024)}</NFSe>`), /5 MiB/);
  assert.throws(() => lerNFSe('<!DOCTYPE x><NFSe><infNFSe Id="a"/></NFSe>'), /DTD/);
  assert.throws(() => lerNFSe('<?xml version="1.0"?><!ENTITY a "b"><NFSe><infNFSe Id="a"/></NFSe>'), /DTD/);
  assert.throws(() => lerNFSe('<Outra><infNFSe Id="a"/></Outra>'), /NFSe/);
  assert.throws(() => lerNFSe('<NFSe><infNFSe/></NFSe>'), /Id/);
  assert.throws(() => lerNFSe('<NFSe><infNFSe Id="  "/></NFSe>'), /Id/);
  assert.throws(() => lerNFSe('<NFSe><infNFSe Id="a">'), /malformado/);
  assert.throws(() => lerNFSe('isto não é xml'), ErroDanfse);
});

test('leitura: "&" solto é reparado e as entidades válidas ficam como estão', () => {
  assert.equal(repararEcomercial('A & B &amp; C &#233; D &lt;'), 'A &amp; B &amp; C &#233; D &lt;');
  const inf = lerNFSe(mutar('<xNome>Prestadora de Serviços Exemplo Ltda</xNome>', '<xNome>Silva & Souza &#233; &lt;ok&gt;</xNome>'));
  assert.equal(inf.emit.xNome, 'Silva & Souza é <ok>');
});

test('formato: moeda, percentual, arredondamento para o par (como o %.2f do Go) e traços', () => {
  assert.equal(f.formatarMoeda(1234.5), 'R$ 1.234,50'); assert.equal(f.formatarMoeda(-1234.5), 'R$ -1.234,50'); assert.equal(f.formatarMoeda(0), 'R$ 0,00');
  assert.equal(f.fixo2(0.125), '0.12'); assert.equal(f.fixo2(0.375), '0.38');
  assert.equal(f.formatarPercentual(5), '5,00%');
  assert.equal(f.valorOuTraco(0), '-'); assert.equal(f.valorOuTraco(undefined), '-'); assert.equal(f.valorOuTraco(10), 'R$ 10,00');
  assert.equal(f.percentualOuTraco(undefined), '-'); assert.equal(f.numeroPercentualOuTraco(5), '5,00');
});

test('formato: documentos, CEP, telefone, datas, códigos e truncamento', () => {
  assert.equal(f.formatarDocumento('12345678000195'), '12.345.678/0001-95'); assert.equal(f.formatarDocumento('12345678901'), '123.456.789-01'); assert.equal(f.formatarDocumento('X1'), 'X1');
  assert.equal(f.formatarCEP('01001000'), '01.001-000'); assert.equal(f.formatarTelefone('1133334444'), '(11) 3333-4444'); assert.equal(f.formatarTelefone('11999998888'), '(11) 99999-8888');
  assert.equal(f.formatarData('2026-07-14'), '14/07/2026'); assert.equal(f.formatarData(''), '-'); assert.equal(f.formatarData('lixo'), 'lixo');
  assert.equal(f.formatarDataHora('2026-07-14T10:05:00-03:00'), '14/07/2026 10:05:00');
  assert.equal(f.formatarCodigoTribNacional('070201'), '07.02.01'); assert.equal(f.formatarNBS('118062000'), '1.1806.20.00');
  assert.equal(f.formatarMunicipioUF('São Paulo', 'SP'), 'São Paulo / SP'); assert.equal(f.formatarMunicipioUF('', ''), '-');
  assert.equal(f.truncarComReticencias('abcdefghij', 5), 'abcde...'); assert.equal(f.truncarComReticencias('abc', 5), 'abc');
  assert.equal(f.truncarComplPreservandoTotais('x'.repeat(2500), 'TOTAIS', 2000), `${'x'.repeat(1997)}... | TOTAIS`);
  assert.equal(f.mapearCStat('101'), 'NFS-e Cancelada'); assert.equal(f.mapearCStat('999'), '999'); assert.equal(f.mapearRetencaoISSQN(2), 'Retido pelo Tomador');
  assert.equal(f.mapearTributacaoISSQN(99), '-'); assert.equal(f.mapearTributacaoISSQN('__proto__' as never), '-');
});

test('localidades: resolve o código IBGE e ignora inválidos', () => {
  assert.deepEqual(resolverMunicipio('3550308'), { nome: 'São Paulo', uf: 'SP' });
  assert.equal(resolverMunicipio(''), undefined); assert.equal(resolverMunicipio('abc'), undefined); assert.equal(resolverMunicipio('0000001'), undefined);
});

test('apresentação: blocos principais da fixture', () => {
  const doc = apresentar(prepararNFSe(lerNFSe(XML), 'valida'));
  assert.equal(doc.cabecalho.municipio, 'São Paulo'); assert.equal(doc.cabecalho.tipoAmbiente, 'Produção');
  assert.equal(doc.acesso.chaveAcesso, '35503082112345678000195000000000000126070000000001'); assert.equal(doc.acesso.situacao, 'NFS-e Regular');
  assert.match(doc.acesso.codigoQR, /^https:\/\/www\.nfse\.gov\.br\/ConsultaPublica\/\?tpc=1&chave=3550/);
  assert.equal(doc.partes.emitente.cnpjCpfNif, '12.345.678/0001-95'); assert.equal(doc.partes.emitente.telefone, '(11) 3333-4444');
  assert.equal(doc.partes.tomador.municipioUF, 'Rio de Janeiro / RJ'); assert.equal(doc.partes.destinatario.visivel, false); assert.equal(doc.partes.intermediario.visivel, false);
  assert.equal(doc.servico.codigoTribNacMun, '07.02.01 / 001'); assert.equal(doc.servico.localPrestacaoUF, 'São Paulo / SP / BR');
  assert.equal(doc.municipal.visivel, true); assert.equal(doc.municipal.bcISSQN, 'R$ 1.000,00'); assert.equal(doc.municipal.aliqAplic, '5,00');
  assert.equal(doc.ibscbs.cstClassTrib, '000 / 000001'); assert.equal(doc.ibscbs.valorTotalCBS, 'R$ 8,55'); assert.equal(doc.ibscbs.aliqEfetMunIBS, '-');
  assert.equal(doc.totais.valorLiquido, 'R$ 1.000,00'); assert.equal(doc.totais.totalIBSCBS, 'R$ 9,50');
  assert.match(doc.complementares.conteudo, /^Inf\. Cont\.: Pagamento em até 30 dias\. \| Núm\. Ped\.: PED-2026-77 \| Item Ped\.: Item A, Item B \| Totais aproximados/);
  assert.equal(doc.canhoto, true); assert.equal(doc.marcaDagua.texto, '');
});

test('apresentação: situação gera marca d’água, tributação municipal ausente é suprimida, PIS/COFINS some após 2026', () => {
  assert.equal(apresentar(prepararNFSe(lerNFSe(XML), 'cancelada')).marcaDagua.texto, 'CANCELADA');
  assert.equal(apresentar(prepararNFSe(lerNFSe(XML), 'substituida')).marcaDagua.texto, 'SUBSTITUÍDA');
  const semMunicipal = lerNFSe(XML); Object.assign(semMunicipal, { cLocIncid: '', xLocIncid: '', xUFIncid: '' }); semMunicipal.dps.valores.tribMun = undefined; semMunicipal.valores = { ...semMunicipal.valores, vBC: 0, vISSQN: 0, pAliqAplic: undefined };
  const doc = apresentar(prepararNFSe(semMunicipal, 'valida'));
  assert.equal(doc.municipal.visivel, false); assert.match(doc.municipal.mensagemSupressao, /NÃO SUJEITA AO ISSQN/);
  assert.equal(exibirPisCofins('2026-12-31'), true); assert.equal(exibirPisCofins('2027-01-01'), false); assert.equal(exibirPisCofins(''), true);
  assert.equal(apresentar(prepararNFSe(lerNFSe(XML), 'valida'), { canhoto: false }).canhoto, false);
});

test('apresentação: destinatário igual ao tomador não repete; linha de tributos por valor, percentual ou zeros', () => {
  const inf = lerNFSe(XML);
  inf.dps.ibscbs!.dest = { ...inf.dps.toma!, im: '' };
  assert.match(apresentar(prepararNFSe(inf, 'valida')).partes.destinatario.mensagemSupressao, /PRÓPRIO TOMADOR/);
  const t = lerNFSe(XML); const tot = t.dps.valores.totTrib;
  assert.match(montarLinhaTotaisTributos(t), /Federais: R\$ 100,00; Estaduais: R\$ 0,00; Municipais: R\$ 50,00;$/);
  Object.assign(tot, { vFed: 0, vEst: 0, vMun: 0, pFed: 13.45 });
  assert.match(montarLinhaTotaisTributos(t), /Federais: 13,45%; Estaduais: 0,00%/);
  tot.pFed = 0; assert.match(montarLinhaTotaisTributos(t), /Federais: R\$ 0,00; Estaduais: R\$ 0,00; Municipais: R\$ 0,00;$/);
});

test('layout: blocos suprimidos encolhem a página e a descrição cede espaço às complementares', () => {
  const doc = apresentar(prepararNFSe(lerNFSe(XML), 'valida'));
  const l = montarLayoutPagina(doc);
  assert.ok(l.servico < 12.74, 'tomador visível e os outros dois suprimidos sobem o serviço');
  const a = calcularAlocacaoTexto(l, true, 40, 5);
  assert.ok(a.linhasDescricao < 40 && a.linhasDescricao >= 1 && a.linhasComplementares >= 1);
});

test('PDF: começa com %PDF, tem uma página A4, é determinístico e não leva data atual', async () => {
  const a = await gerarDanfse(XML); const b = await gerarDanfse(XML);
  assert.equal(texto(a.slice(0, 5)), '%PDF-');
  assert.deepEqual(a, b);
  const pdf = await PDFDocument.load(a);
  assert.equal(pdf.getPageCount(), 1);
  const { width, height } = pdf.getPage(0).getSize(); assert.ok(Math.abs(width - 595.28) < 0.01 && Math.abs(height - 841.89) < 0.01);
  assert.equal(pdf.getCreationDate()?.getUTCFullYear(), 2000);
  const outro = await gerarDanfse(XML, { canhoto: false }); assert.notDeepEqual(a, outro);
});

test('PDF: marca d’água, homologação e textos com caracteres fora do Latin-1 não quebram a geração', async () => {
  for (const stc of [0, 1, 2] as const) assert.equal((await PDFDocument.load(await gerarDanfse(XML, { stc }))).getPageCount(), 1);
  const homolog = await gerarDanfse(mutar('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>'));
  assert.equal((await PDFDocument.load(homolog)).getPageCount(), 1); assert.notDeepEqual(homolog, await gerarDanfse(XML));
  const estranho = await gerarDanfse(mutar('<xNome>Prestadora de Serviços Exemplo Ltda</xNome>', '<xNome>Empresa 😀 日本語 &#1; Ltda</xNome>'));
  assert.equal(texto(estranho.slice(0, 5)), '%PDF-');
});

test('PDF: descrição enorme e informações complementares enormes continuam em uma página', async () => {
  const longo = 'Serviço de manutenção predial com muitas palavras repetidas. '.repeat(200);
  const xml = mutar('<xInfComp>Pagamento em até 30 dias.</xInfComp>', `<xInfComp>${longo}</xInfComp>`).replace(/<xDescServ>.*<\/xDescServ>/, `<xDescServ>${longo}</xDescServ>`);
  assert.equal((await PDFDocument.load(await gerarDanfse(xml))).getPageCount(), 1);
});

test('XML mínimo (sem destinatário nem IBSCBS) ainda gera o PDF, com "-" nos campos', async () => {
  const minimo = '<NFSe><infNFSe Id="NFS123"><nNFSe>1</nNFSe><DPS><infDPS><serv><cServ><xDescServ>Teste</xDescServ></cServ></serv></infDPS></DPS><emit><CNPJ>12345678000195</CNPJ></emit></infNFSe></NFSe>';
  assert.equal(texto((await gerarDanfse(minimo)).slice(0, 5)), '%PDF-');
});
