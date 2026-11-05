import { getUsage } from '@/lib/usage';
export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json(await getUsage(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'As métricas estão temporariamente indisponíveis.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
