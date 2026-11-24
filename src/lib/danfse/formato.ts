/**
 * Formatação e tabelas de apresentação do DANFSe (porta de `danfse_format.go` e de
 * `utils_strings.go` do gerador oficial da Receita Federal; ver o cabeçalho de `pdf.ts`).
 * Funções puras, sem estado.
 */

const MAPA = <T extends string | number>(entradas: Record<T, string>) => entradas;

const TRIBUTACAO_ISSQN = MAPA({
  1: 'Operação Tributável',
  2: 'Imunidade',
  3: 'Exportação de Serviço',
  4: 'Não Incidência',
});
const OPCAO_SIMPLES = MAPA({ 1: '1 - Não Optante', 2: '2 - Optante - MEI', 3: '3 - Optante - ME/EPP' });
const SUSPENSAO = MAPA({
  1: 'Exigibilidade Suspensa por Decisão Judicial',
  2: 'Exigibilidade Suspensa por Processo Administrativo',
});
const BENEFICIO_MUNICIPAL = MAPA({
  1: 'Isenção',
  2: "Redução da BC em 'ppBM' %'",
  3: "Redução da BC em R$ 'vInfoBM'",
  4: "Alíquota Diferenciada de 'aliqDifBM' %",
});
const RETENCAO_ISSQN = MAPA({ 1: 'Não Retido', 2: 'Retido pelo Tomador', 3: 'Retido pelo Intermediário' });
const RETENCAO_PIS_COFINS = MAPA({
  0: 'PIS/COFINS/CSLL Não Retidos',
  1: 'PIS/COFINS Retidos',
  2: 'PIS/COFINS Não Retidos',
  3: 'PIS/COFINS/CSLL Retidos',
  4: 'PIS/COFINS Retidos, CSLL Não Retido',
  5: 'PIS Retido, COFINS/CSLL Não Retido',
  6: 'COFINS Retido, PIS/CSLL Não Retido',
  7: 'PIS Não Retido, COFINS/CSLL Retidos',
  8: 'PIS/COFINS Não Retidos, CSLL Retido',
  9: 'COFINS Não Retido, PIS/CSLL Retidos',
});
const IMUNIDADE = MAPA({
  1: 'Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a)',
  2: 'Templos de qualquer culto (CF88, Art 150, VI, b)',
  3: 'Patrimônio, renda ou serviços dos partidos políticos, inclusive suas fundações, das entidades sindicais dos trabalhadores, das instituições de educação e de assistência social, sem fins lucrativos, atendidos os requisitos da lei (CF88, Art 150, VI, c)',
  4: 'Livros, jornais, periódicos e o papel destinado a sua impressão (CF88, Art 150, VI, d)',
  5: 'Fonogramas e videofonogramas musicais produzidos no Brasil contendo obras musicais ou literomusicais de autores brasileiros e/ou obras em geral interpretadas por artistas brasileiros bem como os suportes materiais ou arquivos digitais que os contenham, salvo na etapa de replicação industrial de mídias ópticas de leitura a laser.   (CF88, Art 150, VI, e)',
});
const REGIME_ESPECIAL = MAPA({
  0: 'Nenhum',
  1: 'Ato Cooperado (Cooperativa)',
  2: 'Estimativa',
  3: 'Microempresa Municipal',
  4: 'Notário ou Registrador',
  5: 'Profissional Autônomo',
  6: 'Sociedade de Profissionais',
  9: 'Outros',
});
const REGIME_APURACAO_SN = MAPA({
  1: '1 - Regime de apuração dos tributos federais e municipal pelo SN',
  2: '2 - Regime de apuração dos tributos federais pelo SN e ISSQN por fora do SN',
});
const TIPO_EMITENTE = MAPA({ 1: 'Prestador', 2: 'Tomador', 3: 'Intermediário' });
const CSTAT = MAPA({
  '100': 'NFS-e Regular',
  '101': 'NFS-e Cancelada',
  '102': 'NFS-e Substituída',
  '103': 'NFS-e de Decisão Judicial ou Administrativa',
  '104': 'NFS-e Emitida em Contingência',
  '105': 'NFS-e de Ajuste',
});
const FINALIDADE = MAPA({ 0: 'NFS-e regular', 1: 'NFS-e de substituição', 2: 'NFS-e de ajuste' });
const AMBIENTE_GERADOR = MAPA({ '1': 'Ambiente de Produção', '2': 'Ambiente de Homologação' });
const TIPO_AMBIENTE = MAPA({ 1: 'Produção', 2: 'Homologação' });

/** Procura só em chaves próprias: valores como "__proto__" ou "constructor" vindos do XML não acham nada. */
const procurar = (tabela: Record<string | number, string>, chave: string | number) =>
  Object.prototype.hasOwnProperty.call(tabela, chave) ? tabela[chave] : '-';

export const mapearCStat = (s: string) => {
  const t = s.trim();
  if (t === '') return '-';
  const mapeado = procurar(CSTAT, t);
  return mapeado === '-' ? t : mapeado;
};
export const mapearTipoAmbiente = (i: number) => procurar(TIPO_AMBIENTE, i);
export const mapearAmbienteGerador = (s: string) => procurar(AMBIENTE_GERADOR, s);
export const mapearTipoEmitente = (i: number) => procurar(TIPO_EMITENTE, i);
export const mapearFinalidade = (i: number) => procurar(FINALIDADE, i);
export const mapearTributacaoISSQN = (i: number) => procurar(TRIBUTACAO_ISSQN, i);
export const mapearOpcaoSimplesNacional = (i: number) => procurar(OPCAO_SIMPLES, i);
export const mapearRegimeEspecial = (i: number) => procurar(REGIME_ESPECIAL, i);
export const mapearRegimeApuracaoSN = (i: number) => procurar(REGIME_APURACAO_SN, i);
export const mapearSuspensao = (i: number) => procurar(SUSPENSAO, i);
export const mapearBeneficioMunicipal = (i: number) => procurar(BENEFICIO_MUNICIPAL, i);
export const mapearRetencaoISSQN = (i: number) => procurar(RETENCAO_ISSQN, i);
export const mapearRetencaoPisCofins = (i: number) => procurar(RETENCAO_PIS_COFINS, i);
export const mapearImunidade = (i: number) => procurar(IMUNIDADE, i);

// ---- Números ----

/**
 * `%.2f` do Go: arredonda a metade para o par (0,125 -> 0,12), diferente do `toFixed` do JavaScript
 * (0,125 -> 0,13). Só empata de verdade quando o valor é múltiplo de 1/8, o que se detecta com exatidão.
 */
export function fixo2(v: number): string {
  const abs = Math.abs(v);
  const oitavos = abs * 8;
  let texto: string;
  if (Number.isInteger(oitavos) && Math.round(abs * 1000) % 10 === 5) {
    const centavos = Math.floor(abs * 100);
    texto = ((centavos % 2 === 0 ? centavos : centavos + 1) / 100).toFixed(2);
  } else texto = abs.toFixed(2);
  return v < 0 ? `-${texto}` : texto;
}

function agrupar(v: number): string {
  const [inteiro, decimal] = fixo2(Math.abs(v)).split('.');
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal}`;
}

/** "R$ 1.234,56" (negativo: "R$ -1.234,56"). */
export const formatarMoeda = (v: number) => `R$ ${v < 0 ? '-' : ''}${agrupar(v)}`;
export const formatarPercentual = (v: number) => `${fixo2(v).replace('.', ',')}%`;
/** Igual a `formatarMoeda`, incluindo o zero ("R$ 0,00"). */
export const formatarValorMonetario = (v: number) => `R$ ${agrupar(v)}`;
/** "-" para ausente ou zero. */
export const valorOuTraco = (v: number | undefined) => (v === undefined || v === 0 ? '-' : `R$ ${agrupar(v)}`);
export const percentualOuTraco = (v: number | undefined) => (v === undefined || v === 0 ? '-' : formatarPercentual(v));
export const numeroPercentualOuTraco = (v: number | undefined) =>
  v === undefined || v === 0 ? '-' : fixo2(v).replace('.', ',');

// ---- Documentos e endereços ----

export function formatarDocumento(s: string): string {
  s = s.trim();
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9, 11)}`;
  if (s.length === 14) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12, 14)}`;
  return s;
}
export const formatarCEP = (s: string) => (s.length === 8 ? `${s.slice(0, 2)}.${s.slice(2, 5)}-${s.slice(5, 8)}` : s);
export function formatarTelefone(s: string): string {
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return d;
}

const soDigitos = (s: string) => s !== '' && /^[0-9]+$/.test(s);
/** AAAA-MM-DD -> DD/MM/AAAA; vazio -> "-"; formato desconhecido volta como veio. */
export function formatarData(s: string): string {
  s = s.trim();
  if (s === '') return '-';
  if (
    s.length === 10 &&
    soDigitos(s.slice(0, 4)) &&
    soDigitos(s.slice(5, 7)) &&
    soDigitos(s.slice(8, 10)) &&
    s[4] === '-' &&
    s[7] === '-'
  )
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return s;
}
/** AAAA-MM-DDTHH:MM:SS[...] -> DD/MM/AAAA HH:MM:SS (o fuso é omitido, como no original). */
export function formatarDataHora(s: string): string {
  s = s.trim();
  if (s === '') return '-';
  if (s.length === 10) return formatarData(s);
  if (s.length < 19 || s[10] !== 'T') return s;
  const data = formatarData(s.slice(0, 10));
  if (data === s.slice(0, 10)) return s;
  if (
    soDigitos(s.slice(11, 13)) &&
    s[13] === ':' &&
    soDigitos(s.slice(14, 16)) &&
    s[16] === ':' &&
    soDigitos(s.slice(17, 19))
  )
    return `${data} ${s.slice(11, 19)}`;
  return s;
}

export function formatarCodigoTribNacional(s: string): string {
  s = s.replace(/\./g, '').trim();
  return s.length === 6 ? `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4, 6)}` : s;
}
export function formatarNBS(conteudo: string): string {
  const d = conteudo.replace(/[^0-9]/g, '');
  return d.length === 9 ? `${d.slice(0, 1)}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}` : conteudo;
}
export function formatarMunicipioUF(municipio: string, uf: string): string {
  municipio = municipio.trim();
  uf = uf.trim();
  if (!municipio && !uf) return '-';
  return municipio && uf ? `${municipio} / ${uf}` : municipio || uf;
}
export function formatarCodigoIBGECEP(ibge: string, cep: string): string {
  ibge = ibge.trim();
  cep = cep.trim();
  if (!ibge && !cep) return '-';
  if (cep.length === 8) cep = `${cep.slice(0, 2)}.${cep.slice(2, 5)}-${cep.slice(5, 8)}`;
  return ibge && cep ? `${ibge} / ${cep}` : ibge || cep;
}

export const tracoSeVazio = (s: string) => (s.trim() === '' ? '-' : s.trim());
export const primeiroNaoVazio = (...valores: string[]) => valores.find((v) => v.trim() !== '') ?? '-';
export function montarEndereco(...partes: string[]): string {
  const valores = partes.map((p) => p.trim()).filter(Boolean);
  return valores.length ? valores.join(', ') : '-';
}

// ---- Truncamento (em pontos de código, como as runas do Go) ----

const pontos = (s: string) => Array.from(s);
const cortarFim = (s: string) => s.replace(/[ \n]+$/, '');

/** Corta em `maxConteudo` caracteres e acrescenta "..." (fora da conta) quando cortou. */
export function truncarComReticencias(texto: string, maxConteudo: number): string {
  const p = pontos(texto);
  if (p.length <= maxConteudo) return texto;
  return `${cortarFim(p.slice(0, Math.max(0, maxConteudo)).join(''))}...`;
}

/** Regra da NT-008: acima de `limite - 3` caracteres a descrição recebe "..." e a linha de totais segue inteira. */
export function truncarComplPreservandoTotais(textoBase: string, linhaTributos: string, limite: number): string {
  if (textoBase === '') return linhaTributos;
  const p = pontos(textoBase);
  if (p.length <= limite - 3) return linhaTributos === '' ? textoBase : `${textoBase} | ${linhaTributos}`;
  const descricao = `${cortarFim(p.slice(0, Math.max(0, limite - 3)).join(''))}...`;
  return linhaTributos === '' ? descricao : `${descricao} | ${linhaTributos}`;
}
