import tabela from './tabela.json';

export type LinhaEncargo = { nome: string; taxa: number; baseLegal?: string };
export type GrupoEncargo = { id: 'A' | 'B' | 'C' | 'D'; titulo: string; linhas: LinhaEncargo[]; total: number };
export type Encargos = { grupos: GrupoEncargo[]; total: number; dias: { uteisAno: number; feriasGozadas: number } };

type Parametros = typeof tabela.encargos.parametros;

/**
 * Encargos sociais e trabalhistas sobre a folha, reimplementando a aba "Encargos Sociais" da planilha (grupos A, B, C e D).
 * Os parâmetros (faltas, aviso prévio, rotatividade...) vêm de tabela.json; com os valores da planilha o total é 84,2359%.
 */
export function calcularEncargos(parametros: Parametros = tabela.encargos.parametros): Encargos {
  const p = parametros;
  const base = tabela.encargos;
  const grupoA = base.grupoA.map(l => ({ nome: l.nome, taxa: l.taxa ?? 0, baseLegal: l.baseLegal ?? undefined }));
  const fgts = grupoA.find(l => l.nome === 'FGTS')?.taxa ?? 0.08;
  const contribuicaoSocial = grupoA.find(l => l.nome.startsWith('CONTRIBUIÇÃO SOCIAL'))?.taxa ?? 0;
  const totalA = grupoA.reduce((soma, l) => soma + l.taxa, 0);

  const domingos = p.domingosAno; const sabados = p.sabadosAno; const feriados = p.feriadosAno; const ano = p.diasAno;
  const feriasGozadas = 30 - (30 * domingos) / ano - (30 * sabados) / ano - (30 * feriados) / ano;
  const maternidade = (p.maternidadeBase.dias - (p.maternidadeBase.dias * domingos) / ano - (p.maternidadeBase.dias * sabados) / ano - (p.maternidadeBase.dias * feriados) / ano) * p.maternidadeBase.participacao * p.maternidadeBase.taxa * p.maternidadeBase.licenca;
  const avisoTrabalhado = p.avisoPrevioTrabalhadoDias * p.avisoPrevioTrabalhadoPct;
  const faltasSomadas = p.faltasJustificadas + p.faltasAtestado + p.acidenteTrabalho + p.auxilioPaternidade + avisoTrabalhado + maternidade + p.representacaoSindical + p.treinamento;
  const diasUteisAno = ano - (domingos + sabados + feriados + faltasSomadas + feriasGozadas) + maternidade;
  const base28 = diasUteisAno;

  const b = {
    ferias: feriasGozadas / base28, doenca: p.faltasAtestado / base28, acidente: p.acidenteTrabalho / base28, paternidade: p.auxilioPaternidade / base28,
    faltasLegais: p.faltasJustificadas / base28, sindical: p.representacaoSindical / base28, avisoTrabalhado: avisoTrabalhado / base28 / p.permanenciaMeses * 12,
    treinamento: p.treinamento / base28, decimoTerceiro: p.diasDecimoTerceiro / base28,
  };
  const umTercoFerias = b.ferias / 3;
  const grupoB: LinhaEncargo[] = [
    { nome: 'Férias', taxa: b.ferias, baseLegal: tabela.encargos.baseLegal['FÉRIAS'] }, { nome: 'Auxílio doença', taxa: b.doenca, baseLegal: tabela.encargos.baseLegal['AUXILIO DOENÇA'] },
    { nome: 'Acidente de trabalho', taxa: b.acidente, baseLegal: tabela.encargos.baseLegal['ACIDENTE DE TRABALHO'] }, { nome: 'Auxílio paternidade', taxa: b.paternidade, baseLegal: tabela.encargos.baseLegal['AUXILIO PATERNIDADE'] },
    { nome: 'Faltas legais', taxa: b.faltasLegais, baseLegal: tabela.encargos.baseLegal['FALTAS LEGAIS'] }, { nome: 'Representação sindical', taxa: b.sindical, baseLegal: tabela.encargos.baseLegal['REPRESENTAÇÃO SINDICAL'] },
    { nome: 'Aviso prévio trabalhado', taxa: b.avisoTrabalhado, baseLegal: tabela.encargos.baseLegal['AVISO PRÉVIO TRABALHADO'] }, { nome: 'Treinamento', taxa: b.treinamento, baseLegal: tabela.encargos.baseLegal['TREINAMENTO'] },
    { nome: '1/3 de férias constitucional', taxa: umTercoFerias, baseLegal: tabela.encargos.baseLegal['1/3 FÉRIAS CONSTITUCIONAL'] }, { nome: '13º salário', taxa: b.decimoTerceiro, baseLegal: tabela.encargos.baseLegal['13o. SALÁRIO'] },
  ];
  const totalB = grupoB.reduce((soma, l) => soma + l.taxa, 0);

  const indenizado = (feriasGozadas / base28) * p.avisoPrevioIndenizadoPct / p.permanenciaMeses * 12;
  const fgtsAviso = indenizado * fgts;
  const csAviso = indenizado * contribuicaoSocial;
  const reflexos = indenizado / 12 + indenizado / 12 / 3 + (indenizado / 12) * (1 + fgts + contribuicaoSocial);
  const demitidos = p.avisoPrevioIndenizadoPct + p.avisoPrevioTrabalhadoPct;
  const multaFgts = (0.032 + totalB * fgts * 0.4 + (indenizado + indenizado / 12) * fgts * 0.4) * demitidos;
  const contribuicaoArt1 = (0.008 + totalB * fgts * 0.1 + (indenizado + 0.0025) * fgts * 0.1) * demitidos;
  const indenizacaoAdicional = (feriasGozadas / base28) * p.demitidosAte30Dias / p.permanenciaMeses * 12;
  const grupoC: LinhaEncargo[] = [
    { nome: 'Aviso prévio indenizado', taxa: indenizado, baseLegal: tabela.encargos.baseLegal['AVISO PRÉVIO INDENIZADO'] }, { nome: 'FGTS sobre aviso prévio', taxa: fgtsAviso, baseLegal: tabela.encargos.baseLegal['FGTS S/ AVISO PRÉVIO'] },
    { nome: 'Contribuição social sobre aviso prévio', taxa: csAviso, baseLegal: tabela.encargos.baseLegal['CONTRIBUIÇÃO SOCIAL'] }, { nome: 'Reflexos no aviso prévio indenizado', taxa: reflexos, baseLegal: tabela.encargos.baseLegal['REFLEXOS NO AVISO PRÉVIO INDENIZADO'] },
    { nome: 'Multa do FGTS', taxa: multaFgts, baseLegal: tabela.encargos.baseLegal['MULTA DO FGTS'] }, { nome: 'Contribuição social (art. 1º, LC 110/01)', taxa: contribuicaoArt1, baseLegal: tabela.encargos.baseLegal['CONTRIBUIÇÃO SOCIAL ARTIGO 1o'] },
    { nome: 'Indenização adicional', taxa: indenizacaoAdicional, baseLegal: tabela.encargos.baseLegal['INDENIZAÇÃO ADICIONAL'] },
  ];
  const totalC = grupoC.reduce((soma, l) => soma + l.taxa, 0);

  const grupoD: LinhaEncargo[] = [
    { nome: 'Grupo A sobre grupo B', taxa: base.grupoD.grupoAsobreB, baseLegal: 'Artigo 28 da Lei 8.212/91' },
    { nome: 'Incidências sobre o salário-maternidade', taxa: base.grupoD.incidenciasSalarioMaternidade, baseLegal: 'Artigo 28 da Lei 8.212/91' },
  ];
  const totalD = grupoD.reduce((soma, l) => soma + l.taxa, 0);
  const grupos: GrupoEncargo[] = [
    { id: 'A', titulo: 'Grupo A — contribuições sobre a folha', linhas: grupoA, total: totalA },
    { id: 'B', titulo: 'Grupo B — férias, 13º e ausências remuneradas', linhas: grupoB, total: totalB },
    { id: 'C', titulo: 'Grupo C — rescisão e aviso prévio', linhas: grupoC, total: totalC },
    { id: 'D', titulo: 'Grupo D — incidências cumulativas', linhas: grupoD, total: totalD },
  ];
  return { grupos, total: totalA + totalB + totalC + totalD, dias: { uteisAno: diasUteisAno, feriasGozadas } };
}
