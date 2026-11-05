// Server/worker only. Never import this module from a client component.
export async function supabaseRequest(path: string, body?: unknown, writer = false) {
  const url = process.env.SUPABASE_URL;
  const key = writer ? process.env.SUPABASE_SECRET_KEY : (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY);
  if (!url || !key) throw new Error('Supabase configuration missing');
  const base = new URL(url);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw new Error('Invalid Supabase URL');
  const response = await fetch(new URL(`/rest/v1/${path}`, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
