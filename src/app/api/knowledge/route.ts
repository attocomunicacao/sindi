import { knowledgeStatus } from '@/lib/knowledge/status';
export const runtime = 'nodejs';
// Público: só se a coleta existe e em que fase está. Contagens, falhas e configuração da nuvem ficam na página /base, que roda no servidor.
export async function GET() { const { available, phase } = await knowledgeStatus() as { available: boolean; phase?: string }; return Response.json({ available, phase: phase ?? null }, { headers: { 'Cache-Control': 'no-store' } }); }
