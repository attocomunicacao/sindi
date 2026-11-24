/** Acesso mínimo ao Redis (Upstash REST), compartilhado pelas métricas de uso e pela cota de mensagens. Só no servidor. */
export function redisConfigurado() { return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN); }
export async function redis(comando: (string | number)[]) {
  const resposta = await fetch(process.env.UPSTASH_REDIS_REST_URL!, { method: 'POST', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(comando), cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!resposta.ok) throw new Error('Redis indisponível');
  const carga = await resposta.json();
  if (carga.error) throw new Error('Redis indisponível');
  return carga.result;
}
