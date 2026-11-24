/**
 * Preparação e apresentação do DANFSe (porta de `danfse_preparation.go`, `danfse_presenter.go` e
 * `danfse_tax_totals.go` do gerador oficial da Receita Federal; ver o cabeçalho de `pdf.ts`).
 *
 *  - `prepararNFSe`: enriquece a infNFSe lida (municípios pelo código IBGE, exclusões/reduções da BC,
 *    textos de descrição e de informações complementares com as regras de truncamento da NT-008);
 *  - `apresentar`: transforma a nota em um documento só de textos prontos para desenhar.
 *
 * Sem I/O e sem data atual: o mesmo XML produz sempre o mesmo documento.
 */
import * as f from '@/lib/danfse/formato';
import { resolverMunicipio } from '@/lib/danfse/localidades';
import { MARCA_DAGUA, type InfNFSe, type NFSe, type Parte, type SituacaoNota } from '@/lib/danfse/modelo';

const MAX_DESCRICAO = 1300;
const MAX_INFO_COMPL = 2000;
/** Consulta pública oficial da NFS-e (a mesma base para todos os ambientes). */
const CONSULTA_PUBLICA = 'https://www.nfse.gov.br';

// ---------------------------------------------------------------------------------------------- tipos do documento

export type SecaoParte = {
  titulo: string; cnpjCpfNif: string; inscricaoMunicipal: string; telefone: string; nome: string; municipioUF: string; codigoIbgeCep: string; endereco: string; email: string;
  visivel: boolean; mensagemSupressao: string; simplesNacional: string; regimeApuracaoSN: string;
};
export type DocumentoDanfse = {
  marcaDagua: { texto: string; tamanhoFonte: number; cor: number; angulo: number; opacidade: number };
  cabecalho: { municipio: string; uf: string; ambienteGerador: string; tipoAmbiente: string };
  acesso: {
    chaveAcesso: string; codigoQR: string; numeroNFSe: string; competencia: string; dataHoraEmissaoNFSe: string; numeroDPS: string; serieDPS: string; dataHoraEmissaoDPS: string;
    tipoEmitente: string; situacao: string; finalidade: string;
  };
  partes: { emitente: SecaoParte; tomador: SecaoParte; destinatario: SecaoParte; intermediario: SecaoParte };
  servico: { codigoTribNacMun: string; codigoNBS: string; localPrestacaoUF: string; xTribNac: string; descServ: string; descServOriginal: string };
  municipal: {
    tribISSQN: string; municipioUFPaisIncid: string; regEspTrib: string; tpImunidade: string; suspensaoExig: string; nProcessoSusp: string; beneficioMunicipal: string; calculoBM: string;
    totalDeducoes: string; descontoIncond: string; bcISSQN: string; aliqAplic: string; retISSQN: string; issqnApurado: string; visivel: boolean; mensagemSupressao: string;
  };
  federal: { irrf: string; contribPrevidRet: string; contribSocRet: string; pisDebito: string; cofinsDebito: string; descContribRet: string; exibirPisCofins: boolean };
  ibscbs: {
    cstClassTrib: string; indOpLocalidadeUF: string; exclusoesReducoesBC: string; bcPosExclusoes: string; redAliqIBSCBS: string; aliqIBSUFMun: string; aliqEfetMunIBS: string; valorMunIBS: string;
    aliqEfetEstIBS: string; valorEstIBS: string; valorTotalIBS: string; aliqCBS: string; aliqEfetCBS: string; valorTotalCBS: string;
  };
  totais: { valorOperacao: string; descontoIncond: string; descontoCond: string; totalRetencoes: string; valorLiquido: string; totalIBSCBS: string; valorLiquidoIBSCBS: string };
  complementares: { conteudo: string; conteudoOriginal: string; linhaTributos: string };
  canhoto: boolean;
};

// ---------------------------------------------------------------------------------------------- preparação

/** Equivalente de `url.QueryEscape` do Go (espaço vira "+", só `-_.~` e alfanuméricos ficam). */
const escaparConsulta = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%20/g, '+');

/** Linha fixa de totais aproximados de tributos (Lei 12.741/2012): valores se houver, senão percentuais, senão zeros. */
export function montarLinhaTotaisTributos(inf: InfNFSe): string {
  const t = inf.dps.valores.totTrib;
  const prefixo = 'Totais aproximados dos Tributos cfe. Lei nº 12.741/2012:';
  if (t.vFed > 0 || t.vEst > 0 || t.vMun > 0) return `${prefixo} Federais: ${f.formatarMoeda(t.vFed)}; Estaduais: ${f.formatarMoeda(t.vEst)}; Municipais: ${f.formatarMoeda(t.vMun)};`;
  if (t.pFed > 0 || t.pEst > 0 || t.pMun > 0) return `${prefixo} Federais: ${f.formatarPercentual(t.pFed)}; Estaduais: ${f.formatarPercentual(t.pEst)}; Municipais: ${f.formatarPercentual(t.pMun)};`;
  return `${prefixo} Federais: R$ 0,00; Estaduais: R$ 0,00; Municipais: R$ 0,00;`;
}

export function montarTextoCompl(inf: InfNFSe): string {
  const dps = inf.dps; const serv = dps.serv;
  const inscImob = serv.obra.inscImobFisc.trim() || dps.ibscbs?.inscImobFisc.trim() || '';
  const itens = serv.infoCompl.itensPed.map(i => i.trim()).filter(Boolean).join(', ');
  const campos: [string, string][] = [
    ['Inf. Cont.:', serv.infoCompl.xInfComp.trim()], ['NFS-e Subst.:', dps.chSubstda.trim()], ['Doc. Ref.:', serv.infoCompl.docRef.trim()],
    ['Cod. Obra:', serv.obra.cObra.trim()], ['Insc. Imob.:', inscImob], ['Cod. Evt.:', serv.idAtvEvt.trim()], ['Doc. Tec.:', serv.infoCompl.idDocTec.trim()],
    ['Núm. Ped.:', serv.infoCompl.xPed.trim()], ['Item Ped.:', itens], ['Inf. A. T. Mun.:', serv.infoCompl.xOutInf.trim()],
  ];
  return campos.filter(([, valor]) => valor !== '').map(([rotulo, valor]) => `${rotulo} ${valor}`).join(' | ');
}

export function calcularExclusoesReducoesBC(inf: InfNFSe): number {
  const federal = inf.dps.valores.tribFed?.pisCofins;
  return inf.dps.valores.vDescIncond + inf.valores.vISSQN + inf.valores.vCalcDR + (inf.ibscbs?.vCalcReeRepRes ?? 0) + (federal ? federal.vPis + federal.vCofins : 0);
}

/** Substitui nome e UF pelos do catálogo IBGE, quando o código é conhecido (como no original). */
function enriquecerMunicipios(inf: InfNFSe) {
  const cidade = resolverMunicipio(inf.cLocIncid);
  if (cidade) { inf.xLocIncid = cidade.nome; inf.xUFIncid = cidade.uf; }
  const aplicar = (alvo: { cMun: string; xMun: string; uf: string } | undefined) => {
    const achada = alvo && resolverMunicipio(alvo.cMun);
    if (alvo && achada) { alvo.xMun = achada.nome; alvo.uf = achada.uf; }
  };
  aplicar(inf.emit.enderNac);
  aplicar(inf.dps.toma?.end?.nac);
  aplicar(inf.dps.ibscbs?.dest?.end?.nac);
  aplicar(inf.dps.interm?.end?.nac);
  if (inf.ibscbs) {
    const loc = resolverMunicipio(inf.ibscbs.cLocalidadeIncid);
    if (loc) { inf.ibscbs.xLocalidadeIncid = loc.nome; inf.ibscbs.uf = loc.uf; }
  }
  const uf = resolverMunicipio(inf.dps.serv.locPrest.cLocPrestacao);
  if (uf) inf.dps.serv.locPrest.uf = uf.uf;
}

export function prepararNFSe(inf: InfNFSe, situacao: SituacaoNota): NFSe {
  enriquecerMunicipios(inf);
  const descricao = inf.dps.serv.xDescServ.trim();
  const textoBase = montarTextoCompl(inf);
  const linhaTributos = montarLinhaTotaisTributos(inf);
  return {
    inf, marcaDagua: MARCA_DAGUA[situacao],
    qrcode: `${CONSULTA_PUBLICA}/ConsultaPublica/?tpc=1&chave=${escaparConsulta(inf.id.replaceAll('NFS', ''))}`,
    vExclusoesReducoesBC: calcularExclusoesReducoesBC(inf),
    textoDescServOriginal: descricao,
    exibicaoDescServ: f.truncarComReticencias(descricao, MAX_DESCRICAO - 3),
    // O texto original é guardado antes de qualquer truncamento.
    textoComplOriginal: textoBase === '' ? linhaTributos : `${textoBase} | ${linhaTributos}`,
    exibicaoLinhaTributos: linhaTributos,
    exibicaoCompl: f.truncarComplPreservandoTotais(textoBase, linhaTributos, MAX_INFO_COMPL),
  };
}

// ---------------------------------------------------------------------------------------------- apresentação

/** PIS/COFINS próprios só aparecem até 31/12/2026 (competência vazia ou inválida: aparecem). */
export function exibirPisCofins(dCompet: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dCompet)) return true;
  const data = new Date(`${dCompet}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dCompet) return true;
  return data.getTime() <= Date.UTC(2026, 11, 31);
}

/** Junta com " / " trocando vazios por "-"; tudo vazio vira "-". */
const combinarComBarra = (...valores: string[]) => { const partes = valores.map(f.tracoSeVazio); return partes.some(p => p !== '-') ? partes.join(' / ') : '-'; };
/** Como `combinarComBarra`, mas para valores já formatados (preserva o "-" existente). */
const combinarValores = (...valores: string[]) => {
  const partes = valores.map(v => (v.trim() === '' ? '-' : v));
  return partes.some(p => p.trim() !== '-') ? partes.join(' / ') : '-';
};
const paisOuBR = (s: string) => s.trim().toUpperCase() || 'BR';

function secaoDeParte(titulo: string, p: Parte, extras: Partial<SecaoParte> = {}): SecaoParte {
  const nac = p.end?.nac;
  return {
    titulo, visivel: true, mensagemSupressao: '', simplesNacional: '-', regimeApuracaoSN: '-',
    cnpjCpfNif: f.tracoSeVazio(f.formatarDocumento(f.primeiroNaoVazio(p.cnpj, p.cpf, p.nif))),
    inscricaoMunicipal: f.tracoSeVazio(p.im), telefone: f.tracoSeVazio(f.formatarTelefone(p.fone)), nome: f.tracoSeVazio(p.xNome),
    municipioUF: nac ? f.formatarMunicipioUF(nac.xMun, nac.uf) : '-',
    codigoIbgeCep: nac ? f.formatarCodigoIBGECEP(nac.cMun, nac.cep) : '-',
    endereco: p.end ? f.tracoSeVazio(f.montarEndereco(p.end.xLgr, p.end.nro, p.end.xCpl, p.end.xBairro)) : '-',
    email: f.tracoSeVazio(p.email),
    ...extras,
  };
}
const suprimida = (mensagem: string): SecaoParte => ({ ...secaoDeParte('', { cnpj: '', cpf: '', nif: '', im: '', xNome: '', fone: '', email: '' }), visivel: false, mensagemSupressao: mensagem });

function montarPartes(nota: NFSe): DocumentoDanfse['partes'] {
  const dps = nota.inf.dps; const e = nota.inf.emit;
  const prest = dps.prest;
  const emitente = secaoDeParte('PRESTADOR / FORNECEDOR', { ...e, end: { xLgr: e.enderNac.xLgr, nro: e.enderNac.nro, xCpl: e.enderNac.xCpl, xBairro: e.enderNac.xBairro, nac: e.enderNac } }, {
    simplesNacional: prest ? f.mapearOpcaoSimplesNacional(prest.opSimpNac) : '-',
    regimeApuracaoSN: prest ? f.mapearRegimeApuracaoSN(prest.regApTribSN) : '-',
  });
  const tomador = dps.toma ? secaoDeParte('TOMADOR / ADQUIRENTE', dps.toma) : suprimida('TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');

  let destinatario = suprimida('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
  const dest = dps.ibscbs?.dest;
  if (dest) {
    // O destinatário que repete o documento do tomador não é impresso de novo.
    const toma = dps.toma;
    const igual = toma && ([[toma.cnpj, dest.cnpj], [toma.cpf, dest.cpf], [toma.nif, dest.nif]] as const).some(([a, b]) => a.trim() !== '' && a === b);
    destinatario = igual ? suprimida('O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO') : secaoDeParte('DESTINATÁRIO DA OPERAÇÃO', { ...dest, im: '' });
  }
  const intermediario = dps.interm ? secaoDeParte('INTERMEDIÁRIO DA OPERAÇÃO', dps.interm) : suprimida('INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
  return { emitente, tomador, destinatario, intermediario };
}

function montarMunicipal(nota: NFSe): DocumentoDanfse['municipal'] {
  const { inf } = nota; const dps = inf.dps;
  const trib = dps.valores.tribMun ?? { tribISSQN: 0, tpRetISSQN: 0, cPaisResult: '', tpImunidade: 0, tpSusp: 0, nProcesso: '', vRedBCBM: 0 };
  const calculoBM = inf.valores.vCalcBM !== 0 ? inf.valores.vCalcBM : trib.vRedBCBM;
  const regEsp = dps.prest?.regEspTrib ?? 0;
  const exibirOpcionais = inf.valores.tpBM > 0 || inf.valores.vCalcBM > 0 || dps.valores.vDR > 0 || dps.valores.vDescIncond > 0;
  const r = {
    tribISSQN: f.mapearTributacaoISSQN(trib.tribISSQN),
    municipioUFPaisIncid: combinarComBarra(inf.xLocIncid, inf.xUFIncid, paisOuBR(trib.cPaisResult)),
    regEspTrib: f.mapearRegimeEspecial(regEsp), tpImunidade: f.mapearImunidade(trib.tpImunidade), suspensaoExig: f.mapearSuspensao(trib.tpSusp), nProcessoSusp: f.tracoSeVazio(trib.nProcesso),
    beneficioMunicipal: f.mapearBeneficioMunicipal(inf.valores.tpBM), calculoBM: f.valorOuTraco(calculoBM), totalDeducoes: f.valorOuTraco(dps.valores.vDR), descontoIncond: f.valorOuTraco(dps.valores.vDescIncond),
    bcISSQN: f.valorOuTraco(inf.valores.vBC), aliqAplic: f.numeroPercentualOuTraco(inf.valores.pAliqAplic), retISSQN: f.mapearRetencaoISSQN(trib.tpRetISSQN), issqnApurado: f.valorOuTraco(inf.valores.vISSQN),
    visivel: true, mensagemSupressao: '',
  };
  if (!exibirOpcionais) { r.beneficioMunicipal = '-'; r.calculoBM = '-'; r.totalDeducoes = '-'; r.descontoIncond = '-'; }
  const temDados = trib.tribISSQN !== 0 || inf.xLocIncid.trim() !== '' || inf.xUFIncid.trim() !== '' || trib.cPaisResult.trim() !== '' || regEsp !== 0 || trib.tpImunidade !== 0 || trib.tpSusp !== 0
    || trib.nProcesso.trim() !== '' || inf.valores.tpBM !== 0 || calculoBM !== 0 || dps.valores.vDR !== 0 || dps.valores.vDescIncond !== 0 || inf.valores.vBC !== 0 || inf.valores.pAliqAplic !== undefined
    || trib.tpRetISSQN !== 0 || inf.valores.vISSQN !== 0;
  if (!temDados) { r.visivel = false; r.mensagemSupressao = 'TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN'; }
  return r;
}

function montarFederal(nota: NFSe): DocumentoDanfse['federal'] {
  const dps = nota.inf.dps;
  const fed = dps.valores.tribFed ?? { vRetIRRF: 0, vRetCSLL: 0, vRetCP: 0 };
  const r = {
    irrf: f.valorOuTraco(fed.vRetIRRF), contribPrevidRet: f.valorOuTraco(fed.vRetCP), contribSocRet: f.valorOuTraco(fed.vRetCSLL),
    pisDebito: '-', cofinsDebito: '-', descContribRet: '-', exibirPisCofins: exibirPisCofins(dps.dCompet),
  };
  const pc = 'pisCofins' in fed ? fed.pisCofins : undefined;
  if (pc) {
    if (pc.tpRetPisCofins === 1) {
      // NT-008 v1.02 §2.4.5: com tpRetPisCofins=1 o PIS/COFINS próprio é 0,00 e a retida soma CSLL + PIS + COFINS.
      r.pisDebito = f.formatarValorMonetario(0); r.cofinsDebito = f.formatarValorMonetario(0);
      r.contribSocRet = f.formatarValorMonetario(fed.vRetCSLL + pc.vPis + pc.vCofins);
    } else { r.pisDebito = f.valorOuTraco(pc.vPis); r.cofinsDebito = f.valorOuTraco(pc.vCofins); }
    r.descContribRet = f.mapearRetencaoPisCofins(pc.tpRetPisCofins);
  }
  return r;
}

function montarIbsCbs(nota: NFSe): DocumentoDanfse['ibscbs'] {
  const dps = nota.inf.dps; const t = nota.inf.ibscbs;
  const comDados = t && dps.ibscbs;
  const cst = comDados ? f.tracoSeVazio(dps.ibscbs!.cst) : '-';
  const cClass = comDados ? f.tracoSeVazio(dps.ibscbs!.cClassTrib) : '-';
  const cIndOp = comDados ? f.tracoSeVazio(dps.ibscbs!.cIndOp) : '-';
  return {
    cstClassTrib: combinarValores(cst, cClass),
    indOpLocalidadeUF: combinarValores(cIndOp, f.tracoSeVazio(t?.cLocalidadeIncid ?? ''), f.tracoSeVazio(t?.xLocalidadeIncid ?? ''), f.tracoSeVazio(t?.uf ?? '')),
    exclusoesReducoesBC: f.valorOuTraco(nota.vExclusoesReducoesBC), bcPosExclusoes: f.valorOuTraco(t?.vBC),
    redAliqIBSCBS: combinarValores(f.percentualOuTraco(t?.pRedAliqUF), f.percentualOuTraco(t?.pRedAliqMun), f.percentualOuTraco(t?.pRedAliqCBS)),
    aliqIBSUFMun: combinarValores(f.percentualOuTraco(t?.pIBSUF), f.percentualOuTraco(t?.pIBSMun)),
    aliqEfetMunIBS: f.percentualOuTraco(t?.pAliqEfetMun), valorMunIBS: f.valorOuTraco(t?.vIBSMun),
    aliqEfetEstIBS: f.percentualOuTraco(t?.pAliqEfetUF), valorEstIBS: f.valorOuTraco(t?.vIBSUF), valorTotalIBS: f.valorOuTraco(t?.vIBSTot),
    aliqCBS: f.percentualOuTraco(t?.pCBS), aliqEfetCBS: f.percentualOuTraco(t?.pAliqEfetCBS), valorTotalCBS: f.valorOuTraco(t?.vCBS),
  };
}

export function apresentar(nota: NFSe, opcoes: { canhoto?: boolean } = {}): DocumentoDanfse {
  const { inf } = nota; const dps = inf.dps;
  const ibs = inf.ibscbs;
  return {
    marcaDagua: { texto: nota.marcaDagua, tamanhoFonte: 60, cor: 0.35, angulo: 45, opacidade: 0.35 },
    cabecalho: { municipio: inf.emit.enderNac.xMun, uf: inf.emit.enderNac.uf, ambienteGerador: f.mapearAmbienteGerador(inf.ambGer), tipoAmbiente: f.mapearTipoAmbiente(dps.tpAmb) },
    acesso: {
      chaveAcesso: f.tracoSeVazio(inf.id.replaceAll('NFS', '')), codigoQR: nota.qrcode, numeroNFSe: f.tracoSeVazio(inf.nNFSe), competencia: f.formatarData(dps.dCompet),
      dataHoraEmissaoNFSe: f.formatarDataHora(inf.dhProc), numeroDPS: f.tracoSeVazio(dps.nDPS), serieDPS: f.tracoSeVazio(dps.serie), dataHoraEmissaoDPS: f.formatarDataHora(dps.dhEmi),
      tipoEmitente: f.mapearTipoEmitente(dps.tpEmit), situacao: f.mapearCStat(inf.cStat),
      finalidade: dps.ibscbs?.finNFSe !== undefined ? f.mapearFinalidade(dps.ibscbs.finNFSe) : '-',
    },
    partes: montarPartes(nota),
    servico: {
      codigoTribNacMun: dps.serv.cTribNac.trim() === '' ? dps.serv.cTribMun.trim()
        : dps.serv.cTribMun.trim() === '' ? f.formatarCodigoTribNacional(dps.serv.cTribNac.trim()) : `${f.formatarCodigoTribNacional(dps.serv.cTribNac.trim())} / ${dps.serv.cTribMun.trim()}`,
      codigoNBS: f.tracoSeVazio(f.formatarNBS(dps.serv.cNBS)),
      localPrestacaoUF: combinarComBarra(inf.xLocPrestacao, dps.serv.locPrest.uf, paisOuBR(dps.serv.locPrest.cPaisPrestacao)),
      xTribNac: f.tracoSeVazio(f.primeiroNaoVazio(inf.xTribMun, inf.xTribNac)),
      descServ: nota.exibicaoDescServ, descServOriginal: nota.textoDescServOriginal,
    },
    municipal: montarMunicipal(nota),
    federal: montarFederal(nota),
    ibscbs: montarIbsCbs(nota),
    totais: {
      valorOperacao: f.formatarValorMonetario(dps.valores.vServ), descontoIncond: f.valorOuTraco(dps.valores.vDescIncond), descontoCond: f.valorOuTraco(dps.valores.vDescCond),
      totalRetencoes: f.valorOuTraco(inf.valores.vTotalRet), valorLiquido: f.formatarValorMonetario(inf.valores.vLiq),
      // Total do IBS/CBS: soma IBS + CBS; "-" quando não há bloco ou a soma é zero.
      totalIBSCBS: ibs ? f.valorOuTraco(ibs.vIBSTot + ibs.vCBS) : '-', valorLiquidoIBSCBS: ibs ? f.valorOuTraco(ibs.vTotNF) : '-',
    },
    complementares: { conteudo: nota.exibicaoCompl, conteudoOriginal: nota.textoComplOriginal, linhaTributos: nota.exibicaoLinhaTributos },
    canhoto: opcoes.canhoto ?? true,
  };
}
