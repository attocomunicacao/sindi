import { readPainel } from '@/lib/dados/painel';
import { montarDashboard } from '@/lib/dados/dashboard';
import { dashboardPdf } from '@/lib/dados/dashboard-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Somente dados públicos agregados das fontes oficiais; nenhuma mensagem, IP ou credencial.
export async function GET() {
  try {
    const dashboard = montarDashboard(readPainel());
    if (!dashboard) return new Response('Painel sem dados.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const bytes = await dashboardPdf(dashboard);
    return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="painel-sindi.pdf"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Não foi possível gerar o PDF.', { status: 500, headers: { 'Cache-Control': 'no-store' } }); }
}
