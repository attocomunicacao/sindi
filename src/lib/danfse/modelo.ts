/**
 * Modelo da NFS-e nacional usado pelo gerador de DANFSe.
 *
 * Porta para TypeScript do gerador oficial de DANFSe da Receita Federal do Brasil
 * (repositório calculadora-rtc-gerador-danfse, em Go, licença MIT; ver o cabeçalho de `pdf.ts`).
 * Só entram os campos que o DANFSe usa. Campos numéricos opcionais (`number | undefined`) existem
 * onde a ausência significa algo diferente de zero: alíquota ausente aparece como "-", não como 0,00%.
 */

export type Endereco = {
  xLgr: string;
  nro: string;
  xCpl: string;
  xBairro: string;
  xMun: string;
  cMun: string;
  uf: string;
  cep: string;
};
/** Endereço de tomador/destinatário/intermediário: a parte nacional é opcional (pode ser endereço no exterior). */
export type EnderecoParte = { xLgr: string; nro: string; xCpl: string; xBairro: string; nac?: Endereco };

export type Emitente = {
  cnpj: string;
  cpf: string;
  nif: string;
  im: string;
  xNome: string;
  fone: string;
  email: string;
  enderNac: Endereco;
};
export type Parte = {
  cnpj: string;
  cpf: string;
  nif: string;
  im: string;
  xNome: string;
  fone: string;
  email: string;
  end?: EnderecoParte;
};

export type Servico = {
  cTribNac: string;
  cTribMun: string;
  xDescServ: string;
  cNBS: string;
  obra: { cObra: string; inscImobFisc: string };
  infoCompl: { xInfComp: string; idDocTec: string; docRef: string; xPed: string; xOutInf: string; itensPed: string[] };
  locPrest: { cLocPrestacao: string; cPaisPrestacao: string; uf: string };
  idAtvEvt: string;
};

export type TribMun = {
  tribISSQN: number;
  tpRetISSQN: number;
  cPaisResult: string;
  tpImunidade: number;
  tpSusp: number;
  nProcesso: string;
  vRedBCBM: number;
};
export type PisCofins = { vPis: number; vCofins: number; tpRetPisCofins: number };
export type TribFed = { vRetIRRF: number; vRetCSLL: number; vRetCP: number; pisCofins?: PisCofins };

export type InfDPS = {
  nDPS: string;
  serie: string;
  dhEmi: string;
  dCompet: string;
  tpEmit: number;
  tpAmb: number;
  prest?: { opSimpNac: number; regApTribSN: number; regEspTrib: number };
  toma?: Parte;
  interm?: Parte;
  serv: Servico;
  valores: {
    vServ: number;
    vDescCond: number;
    vDescIncond: number;
    vDR: number;
    tribMun?: TribMun;
    tribFed?: TribFed;
    totTrib: { vFed: number; vEst: number; vMun: number; pFed: number; pEst: number; pMun: number };
  };
  chSubstda: string;
  ibscbs?: { finNFSe?: number; cIndOp: string; inscImobFisc: string; dest?: Parte; cst: string; cClassTrib: string };
};

export type IBSCBS = {
  xLocalidadeIncid: string;
  uf: string;
  cLocalidadeIncid: string;
  vBC: number;
  vCalcReeRepRes: number;
  pRedAliqUF?: number;
  pIBSUF?: number;
  pAliqEfetUF?: number;
  pRedAliqMun?: number;
  pIBSMun?: number;
  pAliqEfetMun?: number;
  pRedAliqCBS?: number;
  pCBS?: number;
  pAliqEfetCBS?: number;
  vIBSTot: number;
  vIBSMun?: number;
  vIBSUF?: number;
  vCBS: number;
  vTotNF: number;
};

export type InfNFSe = {
  id: string;
  dhProc: string;
  nNFSe: string;
  ambGer: string;
  cStat: string;
  cLocIncid: string;
  xLocIncid: string;
  xUFIncid: string;
  xTribNac: string;
  xTribMun: string;
  xLocPrestacao: string;
  dps: InfDPS;
  emit: Emitente;
  valores: {
    vLiq: number;
    vBC: number;
    vISSQN: number;
    pAliqAplic?: number;
    vCalcBM: number;
    tpBM: number;
    vCalcDR: number;
    vTotalRet: number;
  };
  ibscbs?: IBSCBS;
};

/** NFS-e já lida e enriquecida (municípios resolvidos, textos e totais calculados). */
export type NFSe = {
  inf: InfNFSe;
  /** "", "CANCELADA" ou "SUBSTITUÍDA". */
  marcaDagua: string;
  vExclusoesReducoesBC: number;
  /** Texto da descrição já truncado em 1.300 caracteres. */
  exibicaoDescServ: string;
  textoDescServOriginal: string;
  exibicaoCompl: string;
  textoComplOriginal: string;
  exibicaoLinhaTributos: string;
  /** URL de consulta pública usada no QR code. */
  qrcode: string;
};

/** Situação pedida pelo usuário (código `stc`): 0 válida, 1 substituída, 2 cancelada. */
export type SituacaoNota = 'valida' | 'substituida' | 'cancelada';
export const SITUACAO_POR_STC: Record<number, SituacaoNota> = { 0: 'valida', 1: 'substituida', 2: 'cancelada' };
export const MARCA_DAGUA: Record<SituacaoNota, string> = {
  valida: '',
  substituida: 'SUBSTITUÍDA',
  cancelada: 'CANCELADA',
};

/** Erro com mensagem própria para o usuário (português, sem ecoar o conteúdo do XML). */
export class ErroDanfse extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDanfse';
  }
}
