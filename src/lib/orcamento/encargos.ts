import tabela from '@/lib/orcamento/tabela.json';

export type LinhaEncargo = { nome: string; taxa: number; baseLegal?: string };
export type GrupoEncargo = { id: 'A' | 'B' | 'C' | 'D'; titulo: string; linhas: LinhaEncargo[]; total: number };
export type Encargos = { grupos: GrupoEncargo[]; total: number; dias: { uteisAno: number; feriasGozadas: number } };

type Parametros = typeof tabela.encargos.parametros;

const somar = (linhas: LinhaEncargo[]) => linhas.reduce((soma, l) => soma + l.taxa, 0);

/** Dias do ano que os grupos B e C usam como divisor (o que sobra depois de descansos, faltas e férias). */
function calcularDias(p: Parametros) {
  const domingos = p.domingosAno;
  const sabados = p.sabadosAno;
  const feriados = p.feriadosAno;
  const ano = p.diasAno;
  const feriasGozadas = 30 - (30 * domingos) / ano - (30 * sabados) / ano - (30 * feriados) / ano;
  const maternidade =
    (p.maternidadeBase.dias -
      (p.maternidadeBase.dias * domingos) / ano -
      (p.maternidadeBase.dias * sabados) / ano -
      (p.maternidadeBase.dias * feriados) / ano) *
    p.maternidadeBase.participacao *
    p.maternidadeBase.taxa *
    p.maternidadeBase.licenca;
  const avisoTrabalhado = p.avisoPrevioTrabalhadoDias * p.avisoPrevioTrabalhadoPct;
  const faltasSomadas =
    p.faltasJustificadas +
    p.faltasAtestado +
    p.acidenteTrabalho +
    p.auxilioPaternidade +
    avisoTrabalhado +
    maternidade +
    p.representacaoSindical +
    p.treinamento;
  const diasUteisAno = ano - (domingos + sabados + feriados + faltasSomadas + feriasGozadas) + maternidade;
  return { feriasGozadas, avisoTrabalhado, diasUteisAno };
}
type Dias = ReturnType<typeof calcularDias>;

/** Grupo A: contribuições sobre a folha, já sem as linhas excluídas, e as alíquotas que os outros grupos reaproveitam. */
function montarGrupoA(excluirLinhas: readonly string[] | undefined) {
  const todasA = tabela.encargos.grupoA.map((l) => ({
    nome: l.nome,
    taxa: l.taxa ?? 0,
    baseLegal: l.baseLegal ?? undefined,
  }));
  // Simples Nacional: contribuições que o DAS substitui ou que não se pagam (terceiros/Sistema S; CPP e RAT nos Anexos III e V) saem do grupo A.
  const linhas = todasA.filter((l) => !excluirLinhas?.includes(l.nome));
  // Sem a linha de FGTS na tabela não há como calcular os encargos de rescisão: melhor falhar do que usar uma alíquota presumida.
  const fgts = linhas.find((l) => l.nome === 'FGTS')?.taxa;
  if (fgts === undefined) throw new Error('Tabela de encargos sem a linha de FGTS.');
  const contribuicaoSocial = linhas.find((l) => l.nome.startsWith('CONTRIBUIÇÃO SOCIAL'))?.taxa ?? 0;
  const total = somar(linhas);
  // A linha "Grupo A sobre grupo B" é uma constante da planilha; ao tirar linhas do grupo A ela é reduzida na mesma proporção (aproximação documentada).
  const totalTodas = somar(todasA);
  const escalaD = excluirLinhas?.length && totalTodas > 0 ? total / totalTodas : 1;
  return { linhas, total, fgts, contribuicaoSocial, escalaD };
}

/** Grupo B: férias, 13º e ausências remuneradas, cada uma dividida pelos dias úteis. */
function montarGrupoB(p: Parametros, { feriasGozadas, avisoTrabalhado, diasUteisAno }: Dias): LinhaEncargo[] {
  const base28 = diasUteisAno;
  const b = {
    ferias: feriasGozadas / base28,
    doenca: p.faltasAtestado / base28,
    acidente: p.acidenteTrabalho / base28,
    paternidade: p.auxilioPaternidade / base28,
    faltasLegais: p.faltasJustificadas / base28,
    sindical: p.representacaoSindical / base28,
    avisoTrabalhado: (avisoTrabalhado / base28 / p.permanenciaMeses) * 12,
    treinamento: p.treinamento / base28,
    decimoTerceiro: p.diasDecimoTerceiro / base28,
  };
  const umTercoFerias = b.ferias / 3;
  const lei = tabela.encargos.baseLegal;
  return [
    { nome: 'Férias', taxa: b.ferias, baseLegal: lei['FÉRIAS'] },
    { nome: 'Auxílio doença', taxa: b.doenca, baseLegal: lei['AUXILIO DOENÇA'] },
    { nome: 'Acidente de trabalho', taxa: b.acidente, baseLegal: lei['ACIDENTE DE TRABALHO'] },
    { nome: 'Auxílio paternidade', taxa: b.paternidade, baseLegal: lei['AUXILIO PATERNIDADE'] },
    { nome: 'Faltas legais', taxa: b.faltasLegais, baseLegal: lei['FALTAS LEGAIS'] },
    { nome: 'Representação sindical', taxa: b.sindical, baseLegal: lei['REPRESENTAÇÃO SINDICAL'] },
    { nome: 'Aviso prévio trabalhado', taxa: b.avisoTrabalhado, baseLegal: lei['AVISO PRÉVIO TRABALHADO'] },
    { nome: 'Treinamento', taxa: b.treinamento, baseLegal: lei['TREINAMENTO'] },
    { nome: '1/3 de férias constitucional', taxa: umTercoFerias, baseLegal: lei['1/3 FÉRIAS CONSTITUCIONAL'] },
    { nome: '13º salário', taxa: b.decimoTerceiro, baseLegal: lei['13o. SALÁRIO'] },
  ];
}

/** Grupo C: rescisão e aviso prévio; a multa do FGTS incide sobre o total do B e usa as alíquotas do A. */
function montarGrupoC(
  p: Parametros,
  { feriasGozadas, diasUteisAno }: Dias,
  totalB: number,
  fgts: number,
  contribuicaoSocial: number,
): LinhaEncargo[] {
  const base28 = diasUteisAno;
  const indenizado = (((feriasGozadas / base28) * p.avisoPrevioIndenizadoPct) / p.permanenciaMeses) * 12;
  const fgtsAviso = indenizado * fgts;
  const csAviso = indenizado * contribuicaoSocial;
  const reflexos = indenizado / 12 + indenizado / 12 / 3 + (indenizado / 12) * (1 + fgts + contribuicaoSocial);
  const demitidos = p.avisoPrevioIndenizadoPct + p.avisoPrevioTrabalhadoPct;
  const multa = p.multaFgts;
  const lc110 = p.contribuicaoLc110Art1;
  const multaFgts =
    (multa.base + totalB * fgts * multa.percentual + (indenizado + indenizado / 12) * fgts * multa.percentual) *
    demitidos;
  const contribuicaoArt1 =
    (lc110.base + totalB * fgts * lc110.percentual + (indenizado + lc110.ajuste) * fgts * lc110.percentual) * demitidos;
  const indenizacaoAdicional = (((feriasGozadas / base28) * p.demitidosAte30Dias) / p.permanenciaMeses) * 12;
  const lei = tabela.encargos.baseLegal;
  return [
    { nome: 'Aviso prévio indenizado', taxa: indenizado, baseLegal: lei['AVISO PRÉVIO INDENIZADO'] },
    { nome: 'FGTS sobre aviso prévio', taxa: fgtsAviso, baseLegal: lei['FGTS S/ AVISO PRÉVIO'] },
    { nome: 'Contribuição social sobre aviso prévio', taxa: csAviso, baseLegal: lei['CONTRIBUIÇÃO SOCIAL'] },
    {
      nome: 'Reflexos no aviso prévio indenizado',
      taxa: reflexos,
      baseLegal: lei['REFLEXOS NO AVISO PRÉVIO INDENIZADO'],
    },
    { nome: 'Multa do FGTS', taxa: multaFgts, baseLegal: lei['MULTA DO FGTS'] },
    {
      nome: 'Contribuição social (art. 1º, LC 110/01)',
      taxa: contribuicaoArt1,
      baseLegal: lei['CONTRIBUIÇÃO SOCIAL ARTIGO 1o'],
    },
    { nome: 'Indenização adicional', taxa: indenizacaoAdicional, baseLegal: lei['INDENIZAÇÃO ADICIONAL'] },
  ];
}

/** Grupo D: incidências cumulativas (constantes da planilha; a do grupo A sobre B acompanha as linhas excluídas do A). */
function montarGrupoD(escalaD: number): LinhaEncargo[] {
  const base = tabela.encargos;
  return [
    { nome: 'Grupo A sobre grupo B', taxa: base.grupoD.grupoAsobreB * escalaD, baseLegal: 'Artigo 28 da Lei 8.212/91' },
    {
      nome: 'Incidências sobre o salário-maternidade',
      taxa: base.grupoD.incidenciasSalarioMaternidade,
      baseLegal: 'Artigo 28 da Lei 8.212/91',
    },
  ];
}

/**
 * Encargos sociais e trabalhistas sobre a folha, reimplementando a aba "Encargos Sociais" da planilha (grupos A, B, C e D).
 * Os parâmetros (faltas, aviso prévio, rotatividade...) vêm de tabela.json; com os valores da planilha o total é 84,2359%.
 */
export function calcularEncargos(
  parametros: Parametros = tabela.encargos.parametros,
  opcoes: { excluirLinhas?: readonly string[] } = {},
): Encargos {
  const a = montarGrupoA(opcoes.excluirLinhas);
  const dias = calcularDias(parametros);
  const grupoB = montarGrupoB(parametros, dias);
  const totalB = somar(grupoB);
  const grupoC = montarGrupoC(parametros, dias, totalB, a.fgts, a.contribuicaoSocial);
  const grupoD = montarGrupoD(a.escalaD);
  const totalC = somar(grupoC);
  const totalD = somar(grupoD);
  const grupos: GrupoEncargo[] = [
    { id: 'A', titulo: 'Grupo A — contribuições sobre a folha', linhas: a.linhas, total: a.total },
    { id: 'B', titulo: 'Grupo B — férias, 13º e ausências remuneradas', linhas: grupoB, total: totalB },
    { id: 'C', titulo: 'Grupo C — rescisão e aviso prévio', linhas: grupoC, total: totalC },
    { id: 'D', titulo: 'Grupo D — incidências cumulativas', linhas: grupoD, total: totalD },
  ];
  return {
    grupos,
    total: a.total + totalB + totalC + totalD,
    dias: { uteisAno: dias.diasUteisAno, feriasGozadas: dias.feriasGozadas },
  };
}
