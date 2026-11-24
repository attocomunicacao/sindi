/**
 * Lista CURADA das normas que a SINDI lê direto do Planalto. Só endereços escritos aqui, nunca vindos de usuário, de busca ou de página coletada:
 * entra na lista quem a equipe conferiu (a página abre e é a norma certa). Sem dependências, para o coletor e a busca usarem os mesmos dados.
 */
export type NormaColetada = {
  /** Chave estável, usada em `meta.lei` e nas chaves de estado da coleta. */
  id: string;
  /** Como o título de cada documento começa ("Lei 6.019/1974 — Art. 5º-A"). */
  titulo: string;
  /** Texto do número, como aparece na ementa de outras leis (para achar quem a altera). */
  numero: string;
  url: string;
  /**
   * 'artigos': texto compilado, cada "Art. N" é um documento.
   * 'sequencial': lei que altera outras e cita artigos delas no corpo; só o próximo número da própria lei abre um artigo.
   */
  modo: 'artigos' | 'sequencial';
  /** Linha (inteira, em maiúsculas) em que o corpo da norma começa; antes dela há só o decreto que a aprova. */
  desde?: RegExp;
  /** Menos artigos que isso é extração falha (a página mudou de formato ou veio vazia), não uma lei menor. */
  minimoDeArtigos: number;
  /** Pergunta (normalizada: minúsculas, sem acento) que se refere a esta norma. */
  reconhecer: RegExp;
};

const PLANALTO = 'https://www.planalto.gov.br/ccivil_03/';

export const NORMAS: NormaColetada[] = [
  {
    id: '6019-1974',
    titulo: 'Lei 6.019/1974',
    numero: '6.019',
    url: `${PLANALTO}leis/l6019.htm`,
    modo: 'artigos',
    minimoDeArtigos: 15,
    reconhecer:
      /\b(?:lei|l\.?)\s*(?:n[o.º°]*\s*)?6\.?019\b|\blei\b(?:\s+\w+){0,2}\s+(?:do\s+)?(?:trabalho\s+)?temporario\b|\blei do trabalho temporario\b/,
  },
  {
    id: '13429-2017',
    titulo: 'Lei 13.429/2017',
    numero: '13.429',
    url: `${PLANALTO}_ato2015-2018/2017/lei/l13429.htm`,
    modo: 'sequencial',
    minimoDeArtigos: 3,
    reconhecer: /\b13\.?429\b|\blei (?:da|de) terceirizacao\b/,
  },
  {
    id: '13467-2017',
    titulo: 'Lei 13.467/2017',
    numero: '13.467',
    url: `${PLANALTO}_ato2015-2018/2017/lei/l13467.htm`,
    modo: 'sequencial',
    minimoDeArtigos: 5,
    reconhecer: /\b13\.?467\b|\breforma trabalhista\b/,
  },
  {
    id: '5452-1943',
    titulo: 'Decreto-Lei 5.452/1943 (CLT)',
    numero: '5.452',
    url: `${PLANALTO}decreto-lei/del5452.htm`,
    modo: 'artigos',
    desde: /^CONSOLIDAÇÃO DAS LEIS DO TRABALHO\s*$/,
    minimoDeArtigos: 800,
    reconhecer: /\bclt\b|\bconsolidacao das leis do trabalho\b|\b5\.?452\b/,
  },
  {
    id: 'ec141-2026',
    titulo: 'Emenda Constitucional 141/2026',
    numero: '141',
    url: `${PLANALTO}constituicao/emendas/emc/emc141.htm`,
    modo: 'sequencial',
    minimoDeArtigos: 2,
    reconhecer: /\bemenda constitucional\b(?:\s+n[o.º°]*)?\s*141\b|\bec\s*(?:n[o.º°]*\s*)?141\b/,
  },
];

/** Só https do Planalto, sem credenciais nem porta, dentro de /ccivil_03/: a única origem que o coletor aceita. */
export function urlDoPlanalto(endereco: string): boolean {
  try {
    const url = new URL(endereco);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.planalto.gov.br' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith('/ccivil_03/') &&
      /\.htm$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
