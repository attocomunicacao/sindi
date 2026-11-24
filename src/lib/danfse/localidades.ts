/**
 * Catálogo de municípios (código IBGE -> nome e UF), gerado do catálogo do gerador oficial da Receita
 * Federal (`localidades.json`: código -> [nome, UF], 5.525 municípios). Fica em memória, só leitura.
 */
import tabela from '@/lib/danfse/localidades.json';

const MUNICIPIOS = tabela as unknown as Record<string, [string, string]>;

/** Resolve o código IBGE de 7 dígitos; `undefined` se o código for vazio, inválido ou desconhecido. */
export function resolverMunicipio(codigo: string): { nome: string; uf: string } | undefined {
  const limpo = codigo.trim();
  if (!/^\d{1,7}$/.test(limpo)) return undefined;
  // O Go converte para inteiro (zeros à esquerda não importam); a tabela usa a chave sem zeros.
  const achado = Object.prototype.hasOwnProperty.call(MUNICIPIOS, String(Number(limpo)))
    ? MUNICIPIOS[String(Number(limpo))]
    : undefined;
  return achado ? { nome: achado[0], uf: achado[1] } : undefined;
}
