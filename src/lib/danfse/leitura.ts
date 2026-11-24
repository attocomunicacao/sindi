/**
 * Leitura segura do XML da NFS-e nacional (mesma política do ADR006 do gerador oficial):
 * rejeita vazio, tamanho acima de 5 MiB (antes e depois do reparo do "&"), DOCTYPE/ENTITY,
 * XML malformado, raiz diferente de NFSe e infNFSe sem Id. O processamento de entidades do
 * parser fica DESLIGADO (as cinco entidades padrão e as numéricas são decodificadas aqui, à mão),
 * então não há expansão de entidade nem acesso a arquivo/rede. Nada do conteúdo vai para
 * mensagens de erro nem para log.
 *
 * Os elementos são lidos pelo nome local (o prefixo de namespace é ignorado). Alíquotas ausentes
 * ficam `undefined` (não viram 0,00%).
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ErroDanfse, type Emitente, type Endereco, type EnderecoParte, type InfDPS, type InfNFSe, type IBSCBS, type Parte, type Servico, type TribFed, type TribMun } from './modelo';

export const TAMANHO_MAXIMO_XML = 5 * 1024 * 1024;

type No = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true,
  // Tudo continua texto: quem decide o que é número é este arquivo, não o parser.
  parseTagValue: false, parseAttributeValue: false, trimValues: true,
  // Sem expansão de entidades (nem as declaradas, que de qualquer modo são recusadas antes).
  processEntities: false,
  isArray: nome => nome === 'gItemPed',
});

/** "&" solto (comum em XMLs antigos) vira "&amp;"; entidades válidas ficam como estão. */
export const repararEcomercial = (xml: string) => xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g, '&amp;');

/** Decodifica só as entidades padrão e as numéricas válidas; qualquer outra coisa permanece literal. */
function decodificar(texto: string): string {
  if (!texto.includes('&')) return texto;
  return texto.replace(/&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/g, (inteiro, corpo: string) => {
    switch (corpo) { case 'amp': return '&'; case 'lt': return '<'; case 'gt': return '>'; case 'quot': return '"'; case 'apos': return "'"; }
    const codigo = corpo[1] === 'x' || corpo[1] === 'X' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
    return codigo > 0 && codigo <= 0x10ffff && !(codigo >= 0xd800 && codigo <= 0xdfff) ? String.fromCodePoint(codigo) : inteiro;
  });
}

const proprio = (no: No, chave: string) => Object.prototype.hasOwnProperty.call(no, chave);

/** Filho pelo nome local. Elemento vazio presente (`<trib/>`) vale `{}` (diferente de ausente). Repetido: vale o último, como no Go. */
function filho(no: No | undefined, nome: string): No | undefined {
  if (!no || !proprio(no, nome)) return undefined;
  let valor = no[nome];
  if (Array.isArray(valor)) valor = valor[valor.length - 1];
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor === 'object') return valor as No;
  return {}; // texto sem filhos: o elemento existe
}
const caminho = (no: No | undefined, ...nomes: string[]) => nomes.reduce<No | undefined>((atual, nome) => filho(atual, nome), no);

function texto(no: No | undefined, nome: string): string {
  if (!no || !proprio(no, nome)) return '';
  let valor = no[nome];
  if (Array.isArray(valor)) valor = valor[valor.length - 1];
  if (typeof valor === 'string') return decodificar(valor);
  if (valor && typeof valor === 'object' && typeof (valor as No)['#text'] === 'string') return decodificar((valor as No)['#text'] as string);
  return '';
}
const atributo = (no: No | undefined, nome: string) => (no && proprio(no, `@_${nome}`) && typeof no[`@_${nome}`] === 'string' ? decodificar(no[`@_${nome}`] as string) : '');

const REAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const INTEIRO = /^[+-]?\d+$/;
const LIMITE_VALOR = 1e15; // acima disso o valor não cabe num documento fiscal e quebraria a formatação

function numero(no: No | undefined, nome: string): number | undefined {
  if (!no || !proprio(no, nome)) return undefined;
  const bruto = texto(no, nome).trim();
  if (bruto === '') return 0; // elemento vazio vale 0, como no Go
  if (!REAL.test(bruto)) throw new ErroDanfse(`O campo <${nome}> do XML tem um valor numérico inválido.`);
  const valor = Number(bruto);
  if (!Number.isFinite(valor) || Math.abs(valor) > LIMITE_VALOR) throw new ErroDanfse(`O campo <${nome}> do XML tem um valor fora do limite.`);
  return valor;
}
const real = (no: No | undefined, nome: string) => numero(no, nome) ?? 0;
function inteiro(no: No | undefined, nome: string): number | undefined {
  if (!no || !proprio(no, nome)) return undefined;
  const bruto = texto(no, nome).trim();
  if (bruto === '') return 0;
  if (!INTEIRO.test(bruto) || bruto.length > 9) throw new ErroDanfse(`O campo <${nome}> do XML tem um valor inteiro inválido.`);
  return Number(bruto);
}
const inteiroOuZero = (no: No | undefined, nome: string) => inteiro(no, nome) ?? 0;

function endereco(no: No | undefined): Endereco {
  return { xLgr: texto(no, 'xLgr'), nro: texto(no, 'nro'), xCpl: texto(no, 'xCpl'), xBairro: texto(no, 'xBairro'), xMun: texto(no, 'xMun'), cMun: texto(no, 'cMun'), uf: texto(no, 'UF'), cep: texto(no, 'CEP') };
}
function enderecoParte(no: No | undefined): EnderecoParte | undefined {
  if (!no) return undefined;
  const nac = filho(no, 'endNac');
  return { xLgr: texto(no, 'xLgr'), nro: texto(no, 'nro'), xCpl: texto(no, 'xCpl'), xBairro: texto(no, 'xBairro'), nac: nac ? endereco(nac) : undefined };
}
function parte(no: No, comEnderecoSempre = false): Parte {
  const end = enderecoParte(filho(no, 'end'));
  return {
    cnpj: texto(no, 'CNPJ'), cpf: texto(no, 'CPF'), nif: texto(no, 'NIF'), im: texto(no, 'IM'), xNome: texto(no, 'xNome'), fone: texto(no, 'fone'), email: texto(no, 'email'),
    end: end ?? (comEnderecoSempre ? { xLgr: '', nro: '', xCpl: '', xBairro: '' } : undefined),
  };
}

function lerServico(serv: No | undefined): Servico {
  const cServ = filho(serv, 'cServ'); const obra = filho(serv, 'obra'); const compl = filho(serv, 'infoCompl'); const loc = filho(serv, 'locPrest');
  const bruto = compl && proprio(compl, 'gItemPed') ? compl.gItemPed : undefined;
  const itens = Array.isArray(bruto) ? bruto.map(item => texto(item && typeof item === 'object' ? (item as No) : undefined, 'xItemPed')) : [];
  return {
    cTribNac: texto(cServ, 'cTribNac'), cTribMun: texto(cServ, 'cTribMun'), xDescServ: texto(cServ, 'xDescServ'), cNBS: texto(cServ, 'cNBS'),
    obra: { cObra: texto(obra, 'cObra'), inscImobFisc: texto(obra, 'inscImobFisc') },
    infoCompl: { xInfComp: texto(compl, 'xInfComp'), idDocTec: texto(compl, 'idDocTec'), docRef: texto(compl, 'docRef'), xPed: texto(compl, 'xPed'), xOutInf: texto(compl, 'xOutInf'), itensPed: itens },
    locPrest: { cLocPrestacao: texto(loc, 'cLocPrestacao'), cPaisPrestacao: texto(loc, 'cPaisPrestacao'), uf: texto(loc, 'UF') },
    idAtvEvt: texto(filho(serv, 'atvEvento'), 'idAtvEvt'),
  };
}

function lerTribMun(no: No | undefined): TribMun | undefined {
  if (!no) return undefined;
  const susp = filho(no, 'exigSusp'); const bm = filho(no, 'BM');
  return {
    tribISSQN: inteiroOuZero(no, 'tribISSQN'), tpRetISSQN: inteiroOuZero(no, 'tpRetISSQN'), cPaisResult: texto(no, 'cPaisResult'), tpImunidade: inteiroOuZero(no, 'tpImunidade'),
    tpSusp: inteiroOuZero(susp, 'tpSusp'), nProcesso: texto(susp, 'nProcesso'), vRedBCBM: real(bm, 'vRedBCBM'),
  };
}
function lerTribFed(no: No | undefined): TribFed | undefined {
  if (!no) return undefined;
  const pc = filho(no, 'piscofins');
  return {
    vRetIRRF: real(no, 'vRetIRRF'), vRetCSLL: real(no, 'vRetCSLL'), vRetCP: real(no, 'vRetCP'),
    pisCofins: pc ? { vPis: real(pc, 'vPis'), vCofins: real(pc, 'vCofins'), tpRetPisCofins: inteiroOuZero(pc, 'tpRetPisCofins') } : undefined,
  };
}

function lerDps(inf: No): InfDPS {
  const dps = caminho(inf, 'DPS', 'infDPS');
  const prest = filho(dps, 'prest'); const regTrib = filho(prest, 'regTrib');
  const toma = filho(dps, 'toma'); const interm = filho(dps, 'interm');
  const valores = filho(dps, 'valores'); const trib = filho(valores, 'trib'); const tot = filho(trib, 'totTrib');
  const vTot = filho(tot, 'vTotTrib'); const pTot = filho(tot, 'pTotTrib');
  const ibs = filho(dps, 'IBSCBS'); const dest = filho(ibs, 'dest'); const gibs = caminho(ibs, 'valores', 'trib', 'gIBSCBS');
  const serv = filho(dps, 'serv');
  const descontos = filho(valores, 'vDescCondIncond');
  return {
    nDPS: texto(dps, 'nDPS'), serie: texto(dps, 'serie'), dhEmi: texto(dps, 'dhEmi'), dCompet: texto(dps, 'dCompet'), tpEmit: inteiroOuZero(dps, 'tpEmit'), tpAmb: inteiroOuZero(dps, 'tpAmb'),
    prest: prest ? { opSimpNac: inteiroOuZero(regTrib, 'opSimpNac'), regApTribSN: inteiroOuZero(regTrib, 'regApTribSN'), regEspTrib: inteiroOuZero(regTrib, 'regEspTrib') } : undefined,
    toma: toma ? parte(toma) : undefined,
    interm: interm ? parte(interm, true) : undefined,
    serv: lerServico(serv),
    valores: {
      vServ: real(filho(valores, 'vServPrest'), 'vServ'), vDescCond: real(descontos, 'vDescCond'), vDescIncond: real(descontos, 'vDescIncond'),
      vDR: real(filho(valores, 'vDedRed'), 'vDR'),
      tribMun: lerTribMun(filho(trib, 'tribMun')), tribFed: lerTribFed(filho(trib, 'tribFed')),
      totTrib: { vFed: real(vTot, 'vTotTribFed'), vEst: real(vTot, 'vTotTribEst'), vMun: real(vTot, 'vTotTribMun'), pFed: real(pTot, 'pTotTribFed'), pEst: real(pTot, 'pTotTribEst'), pMun: real(pTot, 'pTotTribMun') },
    },
    chSubstda: texto(filho(dps, 'subst'), 'chSubstda'),
    ibscbs: ibs ? { finNFSe: inteiro(ibs, 'finNFSe'), cIndOp: texto(ibs, 'cIndOp'), inscImobFisc: texto(filho(ibs, 'imovel'), 'inscImobFisc'), dest: dest ? parte(dest) : undefined, cst: texto(gibs, 'CST'), cClassTrib: texto(gibs, 'cClassTrib') } : undefined,
  };
}

function lerIbsCbs(no: No | undefined): IBSCBS | undefined {
  if (!no) return undefined;
  const v = filho(no, 'valores'); const uf = filho(v, 'uf'); const mun = filho(v, 'mun'); const fed = filho(v, 'fed');
  const tot = filho(no, 'totCIBS'); const gibs = filho(tot, 'gIBS');
  return {
    xLocalidadeIncid: texto(no, 'xLocalidadeIncid'), uf: texto(no, 'uf'), cLocalidadeIncid: texto(no, 'cLocalidadeIncid'),
    vBC: real(v, 'vBC'), vCalcReeRepRes: real(v, 'vCalcReeRepRes'),
    pRedAliqUF: numero(uf, 'pRedAliqUF'), pIBSUF: numero(uf, 'pIBSUF'), pAliqEfetUF: numero(uf, 'pAliqEfetUF'),
    pRedAliqMun: numero(mun, 'pRedAliqMun'), pIBSMun: numero(mun, 'pIBSMun'), pAliqEfetMun: numero(mun, 'pAliqEfetMun'),
    pRedAliqCBS: numero(fed, 'pRedAliqCBS'), pCBS: numero(fed, 'pCBS'), pAliqEfetCBS: numero(fed, 'pAliqEfetCBS'),
    vIBSTot: real(gibs, 'vIBSTot'), vIBSMun: numero(filho(gibs, 'gIBSMunTot'), 'vIBSMun'), vIBSUF: numero(filho(gibs, 'gIBSUFTot'), 'vIBSUF'),
    vCBS: real(filho(tot, 'gCBS'), 'vCBS'), vTotNF: real(tot, 'vTotNF'),
  };
}

function lerEmitente(no: No | undefined): Emitente {
  return { cnpj: texto(no, 'CNPJ'), cpf: texto(no, 'CPF'), nif: texto(no, 'NIF'), im: texto(no, 'IM'), xNome: texto(no, 'xNome'), fone: texto(no, 'fone'), email: texto(no, 'email'), enderNac: endereco(filho(no, 'enderNac')) };
}

/** Lê e valida o XML; devolve a infNFSe. Lança `ErroDanfse` (mensagem em português, sem trechos do XML). */
export function lerNFSe(entrada: string): InfNFSe {
  if (entrada.trim() === '') throw new ErroDanfse('O XML está vazio.');
  if (Buffer.byteLength(entrada, 'utf8') > TAMANHO_MAXIMO_XML) throw new ErroDanfse('O XML passa do limite de 5 MiB.');
  const reparado = repararEcomercial(entrada.replace(/^﻿/, ''));
  if (Buffer.byteLength(reparado, 'utf8') > TAMANHO_MAXIMO_XML) throw new ErroDanfse('O XML passa do limite de 5 MiB.');
  // DOCTYPE e ENTITY abrem a porta para expansão de entidades e leitura de arquivos externos: recusados.
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(reparado)) throw new ErroDanfse('O XML contém declaração DTD ou de entidade, que não é aceita.');
  if (XMLValidator.validate(reparado) !== true) throw new ErroDanfse('O XML está malformado.');
  let raiz: No;
  try { raiz = parser.parse(reparado) as No; } catch { throw new ErroDanfse('O XML está malformado.'); }
  const nomeRaiz = Object.keys(raiz).find(chave => !chave.startsWith('?') && !chave.startsWith('@_'));
  if (nomeRaiz !== 'NFSe') throw new ErroDanfse('O elemento raiz do XML deve ser NFSe.');
  const nfse = filho(raiz, 'NFSe') ?? {};
  const inf = filho(nfse, 'infNFSe');
  const id = atributo(inf, 'Id');
  if (!inf || id.trim() === '') throw new ErroDanfse('O elemento infNFSe do XML não tem o atributo Id.');
  const valores = filho(inf, 'valores');
  return {
    id, dhProc: texto(inf, 'dhProc'), nNFSe: texto(inf, 'nNFSe'), ambGer: texto(inf, 'ambGer'), cStat: texto(inf, 'cStat'),
    cLocIncid: texto(inf, 'cLocIncid'), xLocIncid: texto(inf, 'xLocIncid'), xUFIncid: texto(inf, 'xUFIncid'), xTribNac: texto(inf, 'xTribNac'), xTribMun: texto(inf, 'xTribMun'), xLocPrestacao: texto(inf, 'xLocPrestacao'),
    dps: lerDps(inf),
    emit: lerEmitente(filho(inf, 'emit')),
    valores: {
      vLiq: real(valores, 'vLiq'), vBC: real(valores, 'vBC'), vISSQN: real(valores, 'vISSQN'), pAliqAplic: numero(valores, 'pAliqAplic'), vCalcBM: real(valores, 'vCalcBM'),
      tpBM: inteiroOuZero(valores, 'tpBM'), vCalcDR: real(valores, 'vCalcDR'), vTotalRet: real(valores, 'vTotalRet'),
    },
    ibscbs: lerIbsCbs(filho(inf, 'IBSCBS')),
  };
}
