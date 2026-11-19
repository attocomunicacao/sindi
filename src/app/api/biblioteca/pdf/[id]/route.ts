import { lerDocumento } from '@/lib/biblioteca/consulta';
import { obterPdf, pdfPermitido } from '@/lib/biblioteca/pdf';
import { limitarPorMinuto, respostaDeLimite } from '@/lib/limite';

export const runtime = 'nodejs';
const erro = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const texto = (await params).id;
  if (!/^\d{1,9}$/.test(texto)) return erro(400);
  const id = Number(texto);
  if (id < 1) return erro(400);
  const limite = limitarPorMinuto(request, 'biblioteca-pdf', 30); if (!limite.ok) return respostaDeLimite(limite.reiniciaEmSegundos);
  const documento = lerDocumento(id);
  const url = documento && pdfPermitido(documento.fonteOriginal);
  if (!documento || !url) return erro(404);
  try {
    const bytes = await obterPdf(id, url, request.signal);
    if (!bytes) return erro(502);
    return new Response(Buffer.from(bytes), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="documento-${id}.pdf"`, 'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
    } });
  } catch { return erro(502); }
}
