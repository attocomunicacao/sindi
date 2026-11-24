/** Tira acentos e põe em minúsculas, para comparar textos sem depender de grafia. */
export function normalizar(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const PALAVRAS_VAZIAS = new Set(
  'a o as os e de da do das dos em no na nos nas um uma para por com que qual quais como onde posso pode quero saber sobre sindeprestem sindi sindicato nome minha meu meus minhas empresa empresas entender entendo ajuda ajudar ultima ultimas ultimo ultimos recentes latest recent the is are of to in on and can what where please name my union company understand help'.split(
    ' ',
  ),
);
/** Termos de busca de uma pergunta: sem acento, sem palavras vazias, com os sinônimos de contato, notícias e convenções acrescentados. */
export function termosDaConsulta(pergunta: string) {
  let q = normalizar(pergunta);
  q = q
    .replace(/\bservices\b/g, 'servicos')
    .replace(/\bbenefits\b/g, 'beneficios')
    .replace(/\btemporary work\b/g, 'trabalho temporario')
    .replace(/\bcollective agreements?\b/g, 'convencoes coletivas')
    .replace(/\bnews\b/g, 'noticias');
  if (/address|location|endereco|localiza|fica|sede/.test(q)) q += ' endereço contato localização';
  if (/news|latest|recent|noticia|novidade/.test(q)) q += ' notícias';
  if (/collective|agreement|cct|convenc/.test(q)) q += ' convenções coletivas documentos';
  if (/phone|email|telefone|contato|horario|hours/.test(q)) q += ' contato atendimento';
  if (/como.*ajud|how.*help/.test(q)) q += ' servicos';
  return [...new Set(normalizar(q).match(/[a-z0-9]{3,}/g) || [])].filter((w) => !PALAVRAS_VAZIAS.has(w)).slice(0, 20);
}

/** Número da Norma Regulamentadora citada ("NR-1", "NR 17", "norma regulamentadora nº 35"). */
export function numeroDaNR(pergunta: string) {
  const m = normalizar(pergunta).match(/\bnr[-\s]?0?(\d{1,2})\b|norma regulamentadora\s*(?:n[ºo.]?\s*)?0?(\d{1,2})\b/);
  return m ? Number(m[1] ?? m[2]) : undefined;
}

/**
 * Escolhe de um texto longo os blocos que mais combinam com a pergunta, mais o começo (que costuma definir o assunto), em ordem de leitura.
 * É o que permite à SINDI responder com o contexto da pergunta em vez de devolver sempre o mesmo início do documento.
 */
export function trechosRelevantes(texto: string, termos: string[], maximo = 1600, bloco = 600): string {
  const blocos: string[] = [];
  let atual = '';
  for (const paragrafo of texto
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    if (atual && `${atual}\n${paragrafo}`.length > bloco) {
      blocos.push(atual);
      atual = '';
    }
    atual = atual ? `${atual}\n${paragrafo}` : paragrafo;
  }
  if (atual) blocos.push(atual);
  const limitados = blocos.map((b) =>
    b.length > bloco * 1.5 ? b.slice(0, Math.floor(bloco * 1.5)).replace(/\s+\S*$/, '') + ' […]' : b,
  );
  if (limitados.join('\n').length <= maximo) return limitados.join('\n');
  const escolhidos = new Set([0]);
  let tamanho = limitados[0].length;
  const pontuados = limitados
    .map((b, i) => ({ i, b, pontos: termos.filter((t) => normalizar(b).includes(t)).length }))
    .slice(1)
    .sort((x, y) => y.pontos - x.pontos || x.i - y.i);
  for (const { i, b, pontos } of pontuados) {
    if (!pontos) break;
    if (tamanho + b.length > maximo) continue;
    escolhidos.add(i);
    tamanho += b.length;
  }
  return [...escolhidos]
    .sort((x, y) => x - y)
    .map((i) => limitados[i])
    .join('\n[…]\n');
}
