/**
 * Validador mínimo de corpo JSON contra um OpenAPI guardado em tests/fixtures/rtc/ (sem dependência nova). Confere o que importa para o contrato com os serviços
 * da Receita: campo obrigatório presente, campo desconhecido (erro de digitação), tipo errado e enum, seguindo os $ref. Devolve a lista de problemas (vazia = ok).
 */
type Esquema = {
  $ref?: string;
  type?: string | string[];
  required?: string[];
  properties?: Record<string, Esquema>;
  items?: Esquema;
  enum?: unknown[];
};
type Documento = { components: { schemas: Record<string, Esquema> } };

export function validarContraOpenApi(doc: Documento, nomeDoEsquema: string, corpo: unknown): string[] {
  const problemas: string[] = [];
  const resolver = (e: Esquema): Esquema => {
    // Alguns esquemas do springdoc trazem `type: "null"` junto de `$ref`: vale o $ref.
    if (!e.$ref) return e;
    const alvo = doc.components.schemas[e.$ref.replace('#/components/schemas/', '')];
    if (!alvo) throw new Error(`$ref sem destino: ${e.$ref}`);
    return resolver(alvo);
  };
  const tipoDe = (v: unknown) =>
    v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  const visitar = (esquema: Esquema, valor: unknown, caminho: string) => {
    const e = resolver(esquema);
    if (valor === null) {
      const aceitaNulo = Array.isArray(e.type) ? e.type.includes('null') : false;
      if (!aceitaNulo && !esquema.$ref) problemas.push(`${caminho}: nulo não aceito`);
      return;
    }
    const tipos = (Array.isArray(e.type) ? e.type : e.type ? [e.type] : []).filter((t) => t !== 'null');
    const real = tipoDe(valor);
    // `integer` também é `number` no JSON Schema.
    if (tipos.length && !tipos.includes(real) && !(real === 'integer' && tipos.includes('number')))
      problemas.push(`${caminho}: esperado ${tipos.join('|')}, veio ${real}`);
    if (e.enum && !e.enum.includes(valor)) problemas.push(`${caminho}: ${JSON.stringify(valor)} fora do enum`);
    if (real === 'array' && e.items) (valor as unknown[]).forEach((v, i) => visitar(e.items!, v, `${caminho}[${i}]`));
    if (real === 'object' && e.properties) {
      const objeto = valor as Record<string, unknown>;
      for (const obrigatorio of e.required ?? [])
        if (!(obrigatorio in objeto)) problemas.push(`${caminho}.${obrigatorio}: obrigatório ausente`);
      for (const [chave, v] of Object.entries(objeto)) {
        if (v === undefined) continue;
        const filho = e.properties[chave];
        if (!filho) problemas.push(`${caminho}.${chave}: campo desconhecido no contrato`);
        else visitar(filho, v, `${caminho}.${chave}`);
      }
    }
  };
  visitar({ $ref: `#/components/schemas/${nomeDoEsquema}` }, JSON.parse(JSON.stringify(corpo)), '$');
  return problemas;
}
