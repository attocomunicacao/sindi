import { knowledgeStatus } from '@/lib/knowledge/status';
export const runtime = 'nodejs';
export async function GET() { return Response.json(await knowledgeStatus(), { headers: { 'Cache-Control': 'no-store' } }); }
