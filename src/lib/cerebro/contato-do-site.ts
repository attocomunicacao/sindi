/** Formata a página de contato coletada (usado só para gerar o arquivo de contatos do cérebro, não nas respostas do chat). */
export function contatoDaFonte(content: string) {
  const body = content.split('Rodapé institucional')[0];
  const lines = body.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^(ligar|e-?mail|ligare-mail|whatsappe-mail|whatsapp)$/i.test(l));
  const start = lines.findIndex(l => /^setor |^comunica/i.test(l));
  const blocks = start >= 0 ? lines.slice(start) : [];
  const hours = content.match(/Segunda a Sexta das\s*\d{1,2}:\d{2}\s*[ÀàAa]s\s*\d{1,2}:\d{2}/)?.[0]?.replace(/\s+/g, ' ');
  if (!blocks.length && !hours) return undefined;
  const list = blocks.map(l => /^(setor |comunica)/i.test(l) ? `\n**${l}**` : `- ${l}`).join('\n').trim();
  const schedule = hours ? `\n\nHorário: ${hours}.` : '';
  return `Contatos da página oficial:\n\n${list}${schedule}`;
}
