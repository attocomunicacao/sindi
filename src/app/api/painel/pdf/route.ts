import { readPainel } from '@/lib/dados/painel';
import { montarDashboard } from '@/lib/dados/dashboard';
import { dashboardPdf } from '@/lib/dados/dashboard-pdf';
import { limitarPorMinuto, respostaDeLimite } from '@/lib/limite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Somente dados públicos agregados das fontes oficiais; nenhuma mensagem, IP ou credencial.
// O PDF fica pronto por 5 minutos: o mesmo conteúdo para todos, sem refazê-lo a cada pedido.
let pronto: { quando: number; bytes: Uint8Array } | undefined;
export async function GET(request: Request) {
  const limite = limitarPorMinuto(request, 'painel-pdf', 20); if (!limite.ok) return respostaDeLimite(limite.reiniciaEmSegundos);
  try {
    if (!pronto || Date.now() - pronto.quando > 5 * 60_000) {
      const dashboard = montarDashboard(readPainel());
      if (!dashboard) return new Response('Painel sem dados.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
      pronto = { quando: Date.now(), bytes: await dashboardPdf(dashboard) };
    }
    const bytes = pronto.bytes;
    return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="painel-sindi.pdf"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Não foi possível gerar o PDF.', { status: 500, headers: { 'Cache-Control': 'no-store' } }); }
}
