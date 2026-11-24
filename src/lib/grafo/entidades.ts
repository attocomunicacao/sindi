// Sem dependências: usado na construção do grafo (script) e na consulta do chat (servidor).
/**
 * Entidades que ligam os documentos da biblioteca entre si: leis, normas regulamentadoras e projetos de lei citados no texto. Um documento que cita a
 * Lei 13.429/2017 fica ligado a todos os outros que a citam; é isso que faz o "cérebro" virar uma rede, e não uma pilha de arquivos.
 * Só padrões objetivos (número/ano), sem interpretação: o que não casa com o padrão não vira ligação.
 */
export type TipoDeEntidade = 'lei' | 'nr' | 'proposicao';
export type Entidade = { id: string; tipo: TipoDeEntidade; rotulo: string };

// Ano de 2 dígitos: século 21 só até o ano que vem ("Lei 5.452/43" é de 1943; "LC 123/06", de 2006).
const ano4 = (ano: string) =>
  ano.length === 2 ? (2000 + Number(ano) <= new Date().getFullYear() + 1 ? `20${ano}` : `19${ano}`) : ano;
const semPontos = (n: string) => n.replace(/\./g, '');
const pontuado = (n: string) => (n.length > 3 ? `${n.slice(0, -3)}.${n.slice(-3)}` : n);

/** Apelidos de leis muito citadas sem o número. */
const APELIDOS: [RegExp, string, string][] = [
  [/\bclt\b|consolida[cç][aã]o das leis do trabalho/i, 'lei:5452/1943', 'CLT (Decreto-Lei 5.452/1943)'],
  [/reforma trabalhista/i, 'lei:13467/2017', 'Lei 13.467/2017 (Reforma Trabalhista)'],
  [/lei d[ao] terceiriza[cç][aã]o/i, 'lei:13429/2017', 'Lei 13.429/2017'],
  [/\blgpd\b|lei geral de prote[cç][aã]o de dados/i, 'lei:13709/2018', 'Lei 13.709/2018 (LGPD)'],
];

export function extrairEntidades(texto: string, maximo = 40): Entidade[] {
  const achadas = new Map<string, Entidade>();
  const por = (e: Entidade) => {
    if (achadas.size < maximo && !achadas.has(e.id)) achadas.set(e.id, e);
  };
  // "Lei nº 13.429/2017", "Lei 6.019, de 1974", "Lei Complementar 123/06", "Decreto-Lei 5.452/43"
  for (const m of texto.matchAll(
    /\b(lei(?:\s+complementar)?|decreto(?:-lei)?)\s*(?:federal\s*)?(?:n[º°o.]*\s*)?(\d{1,2}\.\d{3}|\d{2,5})\s*(?:\/|,\s*de\s*(?:\d{1,2}\s*de\s*\w+\s*de\s*)?)(\d{4}|\d{2})\b/gi,
  )) {
    const numero = semPontos(m[2]);
    const ano = ano4(m[3]);
    const tipo = /complementar/i.test(m[1])
      ? 'Lei Complementar'
      : /decreto-lei/i.test(m[1])
        ? 'Decreto-Lei'
        : /decreto/i.test(m[1])
          ? 'Decreto'
          : 'Lei';
    por({ id: `lei:${numero}/${ano}`, tipo: 'lei', rotulo: `${tipo} ${pontuado(numero)}/${ano}` });
  }
  // "NR-1", "NR 17", "Norma Regulamentadora nº 35"
  for (const m of texto.matchAll(/\bNR[-\s]?0?(\d{1,2})\b|norma regulamentadora\s*(?:n[º°o.]*\s*)?0?(\d{1,2})\b/gi)) {
    const n = Number(m[1] ?? m[2]);
    if (n >= 1 && n <= 40) por({ id: `nr:${n}`, tipo: 'nr', rotulo: `NR-${n}` });
  }
  // "PL 1234/2023", "PLP 12/2024", "PEC 45/2019"
  for (const m of texto.matchAll(/\b(PLP|PLS|PL|PEC|PDL)\s*(?:n[º°o.]*\s*)?(\d{1,5})\s*\/\s*(\d{4})\b/g))
    por({
      id: `prop:${m[1].toUpperCase()}-${Number(m[2])}/${m[3]}`,
      tipo: 'proposicao',
      rotulo: `${m[1].toUpperCase()} ${Number(m[2])}/${m[3]}`,
    });
  for (const [padrao, id, rotulo] of APELIDOS) if (padrao.test(texto)) por({ id, tipo: 'lei', rotulo });
  return [...achadas.values()];
}
