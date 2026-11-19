import { catalogoPublico } from '@/lib/orcamento/catalogo-publico';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Funções, insumos e parâmetros do formulário (a mesma fonte que a página usa para calcular no navegador). */
export async function GET() {
  return Response.json(catalogoPublico(), { headers: { 'Cache-Control': 'no-store' } });
}
