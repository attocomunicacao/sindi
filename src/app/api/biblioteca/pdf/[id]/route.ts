import { lerDocumento } from '@/lib/biblioteca/consulta';
import { obterPdf, pdfPermitido } from '@/lib/biblioteca/pdf';
import { erroJson, guardaDeLeitura, respostaPdf } from '@/lib/http/guarda';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const texto = (await params).id;
  // Só dígitos: "0x10" e "1e3" seriam números válidos para Number() e gerariam endereços duplicados do mesmo documento.
  if (!/^\d{1,9}$/.test(texto) || Number(texto) < 1) return erroJson('Documento inválido.', 400);
  const limite = guardaDeLeitura(request, 'biblioteca-pdf', 30);
  if (limite) return limite;
  const id = Number(texto);
  // `r` é o código do endereço do documento (vem do link da página): se o id passou a apontar para outro documento, não abre o PDF errado.
  const documento = lerDocumento(id, new URL(request.url).searchParams.get('r') ?? undefined);
  const url = documento && pdfPermitido(documento.fonteOriginal);
  if (!documento || !url) return erroJson('Documento não encontrado.', 404);
  try {
    const bytes = await obterPdf(id, url, request.signal);
    if (!bytes) return erroJson('Não foi possível obter o PDF.', 502);
    return respostaPdf(bytes, `documento-${id}.pdf`, {
      inline: true,
      cache: 'public, max-age=3600',
      extras: { 'X-Frame-Options': 'SAMEORIGIN' },
    });
  } catch {
    return erroJson('Não foi possível obter o PDF.', 502);
  }
}
