// Só no servidor ou no coletor. Nunca importe este módulo de um componente de cliente.
export async function requisitarSupabase(caminho: string, corpo?: unknown, gravador = false) {
  const url = process.env.SUPABASE_URL;
  // A leitura usa só a chave publicável: a Secret key (que ignora as regras de acesso do banco) fica restrita ao coletor que grava.
  const chave = gravador ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) throw new Error('Supabase configuration missing');
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw new Error('Invalid Supabase URL');
  const resposta = await fetch(new URL(`/rest/v1/${caminho}`, base), {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { apikey: chave, ...(chave.startsWith('eyJ') ? { Authorization: `Bearer ${chave}` } : {}), 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo), cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!resposta.ok) throw new Error(`Supabase HTTP ${resposta.status}`);
  return resposta.status === 204 ? null : resposta.json();
}
