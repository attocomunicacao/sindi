// Sem dependências: usado pela página (navegador) e pelos testes. Nada aqui importa node:*, sqlite nem zod.
/**
 * Perguntas do Diagnóstico de Exposição. Regra de ouro: cada pergunta e cada item do plano de ação só afirmam o que consta
 * da(s) fonte(s) oficial(is) citada(s) em `fontes`, lidas no texto coletado (Planalto e gov.br) em 24/11/2026. O que é
 * recomendação prática, e não texto de lei, vem escrito como "Orientação geral:" dentro do próprio item. Informação geral:
 * não é parecer nem consultoria; o caso concreto vai ao Setor Jurídico do SINDEPRESTEM (parecer do advogado, 16/11/2026).
 * Reconferir tudo antes de `VALIDO_ATE` (regulamentação do MTE e leis complementares ainda podem mudar a jornada).
 */
export const ATUALIZADO_EM = '2026-11-24';
export const VALIDO_ATE = '2026-12-31';

/** Fontes oficiais usadas (endereços sem âncora, para o leitor abrir o texto inteiro). */
const EC141 = 'https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc141.htm';
const LEI6019 = 'https://www.planalto.gov.br/ccivil_03/leis/l6019.htm';
const CLT = 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm';
const MTE_PORTARIA =
  'https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2026/novembro/governo-federal-publica-portaria-com-regras-complementares-para-aplicacao-da-escala-5x2';
const NR_DIR =
  'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes';
const NR01 = `${NR_DIR}/nr-01-atualizada-2025-i-3.pdf`;
const NR06 = `${NR_DIR}/nr-06-atualizada-2025-ii.pdf`;

/** Texto do link (o ato e o artigo ou item) e endereço oficial. */
export type Fonte = { rotulo: string; url: string };

export type IdDoTema = 'jornada' | 'coletivas' | 'contratos' | 'contratadas' | 'seguranca';
export type Tema = { id: IdDoTema; rotulo: string; descricao: string };

export const TEMAS: readonly Tema[] = [
  {
    id: 'jornada',
    rotulo: 'Jornada e repouso',
    descricao: 'Emenda Constitucional 141/2026 e o registro da jornada.',
  },
  {
    id: 'coletivas',
    rotulo: 'Normas coletivas, compensação e salário-hora',
    descricao: 'Convenções, banco de horas, 12x36 e o cálculo da hora.',
  },
  {
    id: 'contratos',
    rotulo: 'Contratos com clientes',
    descricao: 'Contratos públicos, de prestação de serviços e de trabalho temporário.',
  },
  {
    id: 'contratadas',
    rotulo: 'Empresas contratadas e responsabilidade',
    descricao: 'Registro e capital, responsabilidade subsidiária e condições de trabalho.',
  },
  {
    id: 'seguranca',
    rotulo: 'Segurança e saúde no trabalho',
    descricao: 'NR-1 (GRO, PGR, riscos psicossociais) e NR-6 (EPI).',
  },
];

export type Pergunta = {
  id: string;
  tema: IdDoTema;
  /** A pergunta, em linguagem direta. "Sim" significa que a empresa está em dia com o tema. */
  texto: string;
  /** O que a fonte diz, em poucas linhas: aparece sob a pergunta para o usuário conferir de onde vem. */
  fato: string;
  /** Item do plano de ação quando a resposta não é "sim": descreve o que a fonte exige ou permite. */
  acao: string;
  /** Pelo menos uma, sempre de domínio oficial (Planalto ou gov.br). */
  fontes: readonly Fonte[];
};

const art = (rotulo: string, url: string): Fonte => ({ rotulo, url });
const PORTARIA = 'Portaria MTE nº 2.041/2026 (notícia do MTE, 23/11/2026)';

export const PERGUNTAS: readonly Pergunta[] = [
  // --- Jornada e repouso ---
  {
    id: 'jornada-repouso',
    tema: 'jornada',
    texto:
      'As escalas da empresa já respeitam o limite de 42 horas semanais (a partir de 16/12/2026) e os 2 dias de repouso semanal?',
    fato: 'A duração normal do trabalho não excederá 42 horas semanais 2 meses após a publicação da emenda (16/10/2026) e 40 horas semanais 1 ano depois; o repouso semanal remunerado passa a ser de 2 dias, um deles preferencialmente aos domingos.',
    acao: 'Revise as escalas para que a duração normal do trabalho não passe de 8 horas diárias e 42 horas semanais a partir de 16/12/2026 (40 horas a partir de 16/12/2027) e para que cada empregado tenha 2 dias de repouso semanal remunerado, um deles preferencialmente aos domingos.',
    fontes: [
      art('EC 141/2026, art. 1º (art. 7º, XIII e XV, da Constituição) e art. 6º, I e II', EC141),
      art(PORTARIA, MTE_PORTARIA),
    ],
  },
  {
    id: 'salario',
    tema: 'jornada',
    texto: 'Você confirmou que a nova jornada não vai reduzir nenhum salário, nem mesmo os pisos salariais?',
    fato: 'A redução da jornada e o aumento do repouso se aplicam aos contratos em vigor e são implementados sem redução salarial nominal, proporcional ou de qualquer outra espécie, inclusive nos pisos salariais.',
    acao: 'Mantenha a remuneração mensal contratada: a emenda vale para os contratos em vigor sem redução salarial nominal, proporcional ou de qualquer outra espécie, inclusive nos pisos salariais.',
    fontes: [art('EC 141/2026, art. 2º e parágrafo único', EC141)],
  },
  {
    id: 'registro-ponto',
    tema: 'jornada',
    texto:
      'Nos estabelecimentos com mais de 20 trabalhadores, a hora de entrada e de saída é anotada (registro manual, mecânico ou eletrônico)?',
    fato: 'A CLT exige a anotação da hora de entrada e de saída, em registro manual, mecânico ou eletrônico, nos estabelecimentos com mais de 20 trabalhadores; quando o trabalho é feito fora do estabelecimento, o horário consta do registro em poder do empregado.',
    acao: 'Confirme o registro da hora de entrada e de saída, manual, mecânico ou eletrônico, nos estabelecimentos com mais de 20 trabalhadores; no trabalho externo, o horário consta do registro em poder do empregado.',
    fontes: [art('CLT (Decreto-Lei 5.452/1943), art. 74, §§ 2º e 3º', CLT)],
  },
  // --- Normas coletivas, compensação e salário-hora ---
  {
    id: 'convencao',
    tema: 'coletivas',
    texto:
      'Você já levantou as cláusulas de convenção ou acordo coletivo sobre duração do trabalho e repouso semanal que a emenda torna sem efeito?',
    fato: 'Decorridos 2 meses da publicação da emenda, ficam sem efeito as cláusulas de convenções e acordos coletivos sobre duração do trabalho e repouso semanal incompatíveis com ela. Segundo o MTE, são exemplos as que fixam jornada semanal acima do limite ou menos de 2 dias de repouso, ressalvado o regime compensatório; as demais disposições do instrumento são preservadas.',
    acao: 'Liste as cláusulas das convenções e dos acordos coletivos sobre duração do trabalho e repouso semanal e separe as incompatíveis com a emenda (jornada acima do limite ou menos de 2 dias de repouso, ressalvado o regime compensatório): elas ficam sem efeito, e as demais disposições do instrumento, segundo o MTE, são preservadas.',
    fontes: [art('EC 141/2026, art. 3º', EC141), art(`${PORTARIA}, item "Normas Coletivas"`, MTE_PORTARIA)],
  },
  {
    id: 'compensacao',
    tema: 'coletivas',
    texto:
      'Se a empresa usa compensação de horários, banco de horas ou escala 12x36, você revisou esse regime com as regras da emenda?',
    fato: 'Convenção ou acordo coletivo podem estabelecer regime compensatório que assegure, na média, 2 dias de repouso semanal remunerado no mês-calendário, com ao menos 1 dia dentro de cada semana de trabalho. A CLT permite o 12x36 por acordo individual escrito, convenção ou acordo coletivo. Segundo o MTE, na 12x36, se a média mensal passar do limite semanal, devem ser compensadas as horas excedentes ou pagas horas extras, nos termos da norma coletiva, e o banco de horas acumulado até 15/12/2026 é compensado ou pago conforme o acordo.',
    acao: 'Revise cada regime de compensação: o repouso deve garantir, na média, 2 dias no mês-calendário, com ao menos 1 dia dentro de cada semana de trabalho (§ 2º do art. 7º da Constituição). Na 12x36, confira se a média mensal passa do limite semanal e, se passar, compense as horas excedentes ou pague horas extras nos termos da norma coletiva (MTE). Defina como será compensado ou pago o saldo do banco de horas acumulado até 15/12/2026.',
    fontes: [
      art('EC 141/2026, art. 1º (§ 2º do art. 7º da Constituição)', EC141),
      art('CLT, art. 59-A', CLT),
      art(PORTARIA, MTE_PORTARIA),
    ],
  },
  {
    id: 'salario-hora',
    tema: 'coletivas',
    texto:
      'O cálculo do salário-hora, que serve de base para horas extras e adicionais, já está pronto para o novo divisor?',
    fato: 'Segundo o MTE, o divisor do salário-hora é 220 na jornada de 44 horas, 210 a partir de 16/12/2026 (42 horas) e 200 a partir de 16/12/2027 (40 horas); permanecem os divisores mais favoráveis ao trabalhador previstos em norma coletiva, contrato ou regulamento da empresa. A hora extra é paga com acréscimo de, pelo menos, 50%.',
    acao: 'Prepare a folha para usar o divisor 210 a partir de 16/12/2026 e 200 a partir de 16/12/2027, mantendo o divisor mais favorável quando houver em norma coletiva, contrato ou regulamento. A hora extra é paga com acréscimo de, pelo menos, 50% sobre a hora normal. A página Jornada 42 da SINDI mostra o efeito do divisor no custo do posto.',
    fontes: [art(`${PORTARIA}, item "Hora de Trabalho"`, MTE_PORTARIA), art('CLT, art. 59, § 1º', CLT)],
  },
  // --- Contratos com clientes ---
  {
    id: 'aditivo',
    tema: 'contratos',
    texto:
      'Os contratos vigentes com órgãos públicos que usam mão de obra direta já estão sendo aditados para manter o equilíbrio econômico-financeiro?',
    fato: 'Nos contratos da administração pública vigentes na data da publicação da emenda e com emprego direto de mão de obra, a redução da jornada se aplica após aditamento para manter o equilíbrio econômico-financeiro, a ser formalizado em até 1 ano da publicação; a regra vale também para concessões, permissões e parcerias.',
    acao: 'Liste os contratos com a administração pública, concessões, permissões e parcerias em que há emprego direto de mão de obra e formalize o aditamento no prazo máximo de 1 ano da publicação da emenda (16/10/2026). Os empregados passam a ser abrangidos na data do aditamento ou, independentemente dele, ao fim desse prazo, assegurada a irredutibilidade salarial; contratos aditados em até 2 meses seguem a nova jornada desde o início das vigências instituídas pela emenda.',
    fontes: [art('EC 141/2026, art. 9º, caput e §§ 1º a 3º', EC141)],
  },
  {
    id: 'contrato-prestacao',
    tema: 'contratos',
    texto:
      'Cada contrato de prestação de serviços traz a qualificação das partes, a especificação do serviço, o prazo (quando for o caso) e o valor?',
    fato: 'O contrato de prestação de serviços conterá qualificação das partes, especificação do serviço, prazo para realização do serviço, quando for o caso, e valor. É vedado à contratante usar os trabalhadores em atividades distintas das do contrato.',
    acao: 'Confira se cada contrato de prestação de serviços contém qualificação das partes, especificação do serviço, prazo (quando for o caso) e valor, e se os trabalhadores atuam só nas atividades que foram objeto do contrato.',
    fontes: [art('Lei 6.019/1974, art. 5º-B e art. 5º-A, § 1º', LEI6019)],
  },
  {
    id: 'contrato-temporario',
    tema: 'contratos',
    texto:
      'Nos contratos de trabalho temporário, o contrato com a tomadora é por escrito, com motivo justificador, prazo, valor e disposições de segurança e saúde?',
    fato: 'O contrato entre a empresa de trabalho temporário e a tomadora é por escrito, fica à disposição da fiscalização no estabelecimento da tomadora e contém qualificação das partes, motivo justificador, prazo, valor e disposições sobre segurança e saúde. O contrato do trabalhador não pode exceder 180 dias, com prorrogação por até 90 dias quando mantidas as condições que o ensejaram.',
    acao: 'Confira se cada contrato com a tomadora é escrito, está à disposição da fiscalização no estabelecimento da tomadora e traz qualificação das partes, motivo justificador, prazo, valor e disposições de segurança e saúde. O contrato do trabalhador temporário não pode exceder 180 dias, com prorrogação de até 90 dias quando comprovada a manutenção das condições; o mesmo trabalhador só volta à mesma tomadora em novo contrato temporário após 90 dias do término do anterior, e a contratação antes disso caracteriza vínculo com a tomadora.',
    fontes: [art('Lei 6.019/1974, art. 9º e art. 10, §§ 1º, 2º, 5º e 6º', LEI6019)],
  },
  // --- Empresas contratadas e responsabilidade ---
  {
    id: 'registro-capital',
    tema: 'contratadas',
    texto:
      'A empresa de trabalho temporário ou de prestação de serviços (a sua ou a que você contrata) tem CNPJ, registro na Junta Comercial e o capital social mínimo da lei?',
    fato: 'A empresa de trabalho temporário precisa de prova de CNPJ, registro na Junta Comercial e capital social de, no mínimo, R$ 100.000,00, para funcionar e se registrar no Ministério do Trabalho. A prestadora de serviços a terceiros precisa de CNPJ, Junta Comercial e capital compatível com o número de empregados, de R$ 10.000,00 (até 10) a R$ 250.000,00 (mais de 100).',
    acao: 'Confira e guarde as provas: CNPJ, registro na Junta Comercial e capital social. Empresa de trabalho temporário: registro no Ministério do Trabalho e capital mínimo de R$ 100.000,00. Prestadora de serviços: capital mínimo de R$ 10.000,00 (até 10 empregados), R$ 25.000,00 (mais de 10 e até 20), R$ 45.000,00 (mais de 20 e até 50), R$ 100.000,00 (mais de 50 e até 100) ou R$ 250.000,00 (mais de 100).',
    fontes: [art('Lei 6.019/1974, art. 6º (temporário) e art. 4º-B (prestação de serviços)', LEI6019)],
  },
  {
    id: 'responsabilidade-subsidiaria',
    tema: 'contratadas',
    texto:
      'Você acompanha se a empresa contratada paga salários e recolhe os encargos dos trabalhadores colocados à sua disposição?',
    fato: 'A contratante é subsidiariamente responsável pelas obrigações trabalhistas referentes ao período em que ocorrer a prestação de serviços ou o trabalho temporário, e o recolhimento das contribuições previdenciárias observa o art. 31 da Lei 8.212/1991.',
    acao: 'A contratante responde subsidiariamente pelas obrigações trabalhistas do período da prestação de serviços ou do trabalho temporário, e o recolhimento previdenciário observa o art. 31 da Lei 8.212/1991. Orientação geral: defina uma rotina periódica de conferência documental (folha de pagamento e recolhimentos da contratada) e leve ao Setor Jurídico qualquer divergência.',
    fontes: [art('Lei 6.019/1974, art. 5º-A, § 5º, e art. 10, § 7º', LEI6019)],
  },
  {
    id: 'condicoes-tomadora',
    tema: 'contratadas',
    texto:
      'Quando empregados da prestadora atuam nas dependências da tomadora, as condições de segurança, higiene, alimentação, transporte e atendimento médico estão asseguradas?',
    fato: 'Quando os serviços são executados nas dependências da tomadora, são asseguradas aos empregados da prestadora as mesmas condições de alimentação em refeitório, uso do transporte, atendimento médico ou ambulatorial existente, treinamento adequado fornecido pela contratada e condições sanitárias, de proteção à saúde e de segurança. A contratante garante as condições de segurança, higiene e salubridade quando o trabalho é feito em suas dependências.',
    acao: 'Para os trabalhadores da prestadora que atuam nas dependências da tomadora, assegure as mesmas condições de alimentação em refeitório, transporte, atendimento médico ou ambulatorial e as condições sanitárias, de proteção à saúde e de segurança; a contratada fornece o treinamento adequado quando a atividade o exigir, e a contratante garante a segurança, a higiene e a salubridade do local.',
    fontes: [art('Lei 6.019/1974, art. 4º-C, I e II, e art. 5º-A, § 3º', LEI6019)],
  },
  // --- Segurança e saúde no trabalho ---
  {
    id: 'pgr',
    tema: 'seguranca',
    texto:
      'Cada estabelecimento tem Programa de Gerenciamento de Riscos (PGR) e, havendo contratadas atuando nas suas dependências, o PGR as contempla?',
    fato: 'A organização deve implementar o gerenciamento de riscos ocupacionais por meio do PGR, por estabelecimento. O PGR da contratante deve incluir as medidas de prevenção para as contratadas que atuem em suas dependências ou usar os programas delas, caso em que elas fornecem o inventário de riscos e o plano de ação. Segundo o MTE, nos regimes de prorrogação ou compensação de jornada deve-se considerar os efeitos sobre os riscos e, quando cabível, revisar as medidas e atualizar o PGR.',
    acao: 'Mantenha o PGR por estabelecimento. Havendo contratadas nas suas dependências, inclua no PGR as medidas de prevenção para elas ou use os programas delas, exigindo o inventário de riscos e o plano de ação das atividades contratadas (NR-1, item 1.5.8.1). Ao mudar escalas, prorrogação ou compensação de jornada, considere os efeitos sobre os riscos e atualize o PGR, segundo o MTE.',
    fontes: [
      art('NR-1, itens 1.5.3.1, 1.5.3.1.1.1, 1.5.8.1 e 1.5.8.1.1', NR01),
      art(`${PORTARIA}, item sobre segurança e saúde no trabalho`, MTE_PORTARIA),
    ],
  },
  {
    id: 'psicossociais',
    tema: 'seguranca',
    texto: 'O gerenciamento de riscos da empresa inclui os fatores de risco psicossociais relacionados ao trabalho?',
    fato: 'O gerenciamento de riscos ocupacionais deve abranger os riscos dos agentes físicos, químicos, biológicos, de acidentes e ergonômicos, incluindo os fatores de risco psicossociais relacionados ao trabalho; a organização deve identificar perigos, avaliar e classificar riscos, adotar medidas de prevenção e contar com a participação dos trabalhadores. O empregador informa aos trabalhadores os riscos existentes e as medidas de prevenção adotadas.',
    acao: 'Inclua os fatores de risco psicossociais relacionados ao trabalho no gerenciamento de riscos: identifique os perigos, avalie e classifique os riscos, elabore plano de ação com as medidas de prevenção e acompanhe o controle, com a participação dos trabalhadores. Informe-lhes os riscos existentes e as medidas adotadas (NR-1, item 1.4.1, b).',
    fontes: [art('NR-1, itens 1.4.1, 1.5.3.1.4, 1.5.3.2, 1.5.3.2.1, 1.5.3.3 e 1.5.5.2.1', NR01)],
  },
  {
    id: 'epi',
    tema: 'seguranca',
    texto:
      'Quando o EPI é necessário, a empresa fornece o equipamento adequado gratuitamente, registra a entrega, treina o empregado e exige o uso?',
    fato: 'Cabe à organização, quanto ao EPI: adquirir só o aprovado, orientar e treinar o empregado, fornecer gratuitamente EPI adequado ao risco e em perfeito estado, registrar o fornecimento, exigir o uso, cuidar da higienização e manutenção e substituir imediatamente o danificado ou extraviado. Ao fim dos treinamentos previstos nas NR deve ser emitido certificado.',
    acao: 'Para o EPI: compre só o aprovado pelo órgão competente, oriente e treine o empregado, forneça gratuitamente o adequado ao risco e em perfeito estado, registre a entrega (livro, ficha ou sistema), exija o uso, cuide da higienização e manutenção e substitua de imediato o danificado ou extraviado. Emita o certificado ao término dos treinamentos previstos nas NR. O EPI entra na hierarquia da prevenção quando a proteção coletiva é inviável ou insuficiente, ou em caráter complementar ou emergencial (NR-1, item 1.5.5.1.2).',
    fontes: [art('NR-6, item 6.5.1', NR06), art('NR-1, itens 1.5.5.1.2, 1.7.1 e 1.7.1.1', NR01)],
  },
];
