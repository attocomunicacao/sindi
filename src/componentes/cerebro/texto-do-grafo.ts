// Texto do grafo sem DOM: quebra de linha por largura e escolha de rótulos que não se sobrepõem. Funções puras, para o desenho e os testes.

/** Mede a largura (em pixels) de um texto na fonte já escolhida; no navegador é `ctx.measureText(t).width`. */
export type Medidor = (texto: string) => number;

/** Corta o texto, com reticências, até caber na largura. */
export function caberNaLargura(texto: string, largura: number, medir: Medidor) {
  if (medir(texto) <= largura) return texto;
  let fim = texto.length;
  while (fim > 1 && medir(`${texto.slice(0, fim)}…`) > largura) fim--;
  return `${texto.slice(0, Math.max(1, fim)).trimEnd()}…`;
}

/**
 * Quebra o texto em linhas de até `largura` pixels, por palavras. Palavra maior que a linha é cortada; passando de `maxLinhas`, a última linha
 * termina em reticências. Nunca devolve uma linha mais larga que `largura` (a menos que um único caractere já não caiba).
 */
export function quebrarTexto(texto: string, largura: number, medir: Medidor, maxLinhas = 3): string[] {
  const palavras = texto.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!palavras.length) return [];
  const linhas: string[] = [];
  let atual = '';
  const fechar = () => {
    if (atual) linhas.push(atual);
    atual = '';
  };
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (medir(tentativa) <= largura) {
      atual = tentativa;
      continue;
    }
    fechar();
    // Palavra sozinha maior que a linha (URL, número de processo): corta em pedaços que caibam.
    let resto = palavra;
    while (medir(resto) > largura && resto.length > 1) {
      let corte = resto.length - 1;
      while (corte > 1 && medir(resto.slice(0, corte)) > largura) corte--;
      linhas.push(resto.slice(0, corte));
      resto = resto.slice(corte);
    }
    atual = resto;
  }
  fechar();
  if (linhas.length <= maxLinhas) return linhas;
  const visiveis = linhas.slice(0, maxLinhas);
  visiveis[maxLinhas - 1] = caberNaLargura(`${visiveis[maxLinhas - 1]}…`, largura, medir);
  return visiveis;
}

/** "+ 1 outra ligação" / "+ 3.988 outras ligações": o que sobra além dos vizinhos mostrados. */
export const maisLigacoes = (quantas: number) =>
  quantas === 1 ? '+ 1 outra ligação' : `+ ${quantas.toLocaleString('pt-BR')} outras ligações`;

export type Caixa = { id: string; x: number; y: number; largura: number; altura: number; prioridade: number };

const seSobrepoem = (a: Caixa, b: Caixa, folga: number) =>
  a.x < b.x + b.largura + folga &&
  a.x + a.largura + folga > b.x &&
  a.y < b.y + b.altura + folga &&
  a.y + a.altura + folga > b.y;

/** Dos rótulos candidatos, os de maior prioridade que não se sobrepõem (até `maximo`): é o que evita a mancha de textos empilhados. */
export function escolherRotulos(candidatos: Caixa[], maximo: number, folga = 2): Caixa[] {
  const escolhidos: Caixa[] = [];
  for (const c of [...candidatos].sort((a, b) => b.prioridade - a.prioridade)) {
    if (escolhidos.length >= maximo) break;
    if (escolhidos.some((e) => seSobrepoem(c, e, folga))) continue;
    escolhidos.push(c);
  }
  return escolhidos;
}
