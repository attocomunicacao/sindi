/** Formata a página de contato coletada (usado só para gerar o arquivo de contatos do cérebro, não nas respostas do chat). */
export function contatoDaFonte(conteudo: string) {
  const corpo = conteudo.split('Rodapé institucional')[0];
  const linhas = corpo.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^(ligar|e-?mail|ligare-mail|whatsappe-mail|whatsapp)$/i.test(l));
  const inicio = linhas.findIndex(l => /^setor |^comunica/i.test(l));
  const blocos = inicio >= 0 ? linhas.slice(inicio) : [];
  const horario = conteudo.match(/Segunda a Sexta das\s*\d{1,2}:\d{2}\s*[ÀàAa]s\s*\d{1,2}:\d{2}/)?.[0]?.replace(/\s+/g, ' ');
  if (!blocos.length && !horario) return undefined;
  const lista = blocos.map(l => /^(setor |comunica)/i.test(l) ? `\n**${l}**` : `- ${l}`).join('\n').trim();
  const agenda = horario ? `\n\nHorário: ${horario}.` : '';
  return `Contatos da página oficial:\n\n${lista}${agenda}`;
}
