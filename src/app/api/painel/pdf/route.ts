import { lerPainelEmCache } from '@/lib/dados/painel';
import { montarDashboard } from '@/lib/dados/dashboard';
import { dashboardPdf } from '@/lib/dados/dashboard-pdf';
import { erroJson, guardaDeLeitura, respostaPdf } from '@/lib/http/guarda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Somente dados públicos agregados das fontes oficiais; nenhuma mensagem, IP ou credencial.
// O PDF fica pronto por 5 minutos: o mesmo conteúdo para todos, sem refazê-lo a cada pedido.
let pronto: { quando: number; bytes: Uint8Array } | undefined;
export async function GET(request: Request) {
  const limite = guardaDeLeitura(request, 'painel-pdf', 20); if (limite) return limite;
  try {
    if (!pronto || Date.now() - pronto.quando > 5 * 60_000) {
      const dashboard = montarDashboard(lerPainelEmCache());
      if (!dashboard) return erroJson('Painel sem dados.', 503);
      pronto = { quando: Date.now(), bytes: await dashboardPdf(dashboard) };
    }
    return respostaPdf(pronto.bytes, 'painel-sindi.pdf');
  } catch { return erroJson('Não foi possível gerar o PDF.', 500); }
}
