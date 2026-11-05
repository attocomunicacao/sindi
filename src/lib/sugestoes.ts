/**
 * Perguntas sugeridas na tela inicial do chat. Cada uma tem resposta na biblioteca da SINDI (cérebro, documentos ou indicadores coletados), de assuntos variados,
 * para que quem abre o chat veja sempre três perguntas diferentes e conheça o que a assistente sabe.
 */
export const SUGESTOES = [
  'Como o SINDEPRESTEM pode ajudar minha empresa?',
  'Onde encontro as convenções coletivas?',
  'O que é trabalho temporário?',
  'Qual a diferença entre empresa associada e filiada?',
  'Quais são as contribuições do sindicato e quando vencem?',
  'Quem faz parte da diretoria do SINDEPRESTEM?',
  'Qual o prazo máximo do trabalho temporário?',
  'Como funciona o orçamento de terceirização?',
  'O que é a NR-1?',
  'Qual a diferença entre terceirização e trabalho temporário?',
  'Quais cartilhas o sindicato publica?',
  'Qual o piso salarial da convenção de portaria?',
  'Como falar com o Setor Jurídico?',
  'Quais os horários de atendimento do sindicato?',
  'Quais as últimas notícias do sindicato?',
  'O que o sindicato pensa sobre a escala 6x1?',
  'Qual a meta da taxa Selic hoje?',
  'Quantos empregos formais foram criados no último mês?',
  'Quais projetos de lei sobre terceirização estão no Congresso?',
  'Como me associo ao SINDEPRESTEM?',
  'Quais documentos jurídicos o sindicato publica?',
  'Qual a missão do SINDEPRESTEM?',
  'Preciso de um orçamento para 3 porteiros diurnos e 2 noturnos.',
  'O que diz o art. 7º da Constituição sobre jornada de trabalho?',
] as const;

/**
 * Sorteia `quantidade` perguntas diferentes entre si e, quando há perguntas suficientes, diferentes das mostradas antes: abrir uma conversa nova
 * nunca repete a sugestão anterior. `aleatorio` é injetável para testes.
 */
export function sortearSugestoes(anteriores: readonly string[] = [], quantidade = 3, aleatorio: () => number = Math.random): string[] {
  const disponiveis = SUGESTOES.filter(s => !anteriores.includes(s));
  const base = [...(disponiveis.length >= quantidade ? disponiveis : SUGESTOES)];
  for (let i = base.length - 1; i > 0; i--) { const j = Math.floor(aleatorio() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  return base.slice(0, quantidade);
}
