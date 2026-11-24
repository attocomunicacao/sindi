import { catalogoPublico } from '@/lib/orcamento/catalogo-publico';
import { guardaDeLeitura, jsonSemCache } from '@/lib/http/guarda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Funções, insumos e parâmetros do formulário (a mesma fonte que a página usa para calcular no navegador). */
export async function GET(request: Request) {
  const limite = guardaDeLeitura(request, 'orcamento-catalogo', 120);
  if (limite) return limite;
  return jsonSemCache(catalogoPublico());
}
