// Repasse do endereço fixo (Vercel) para o túnel que chega à aplicação neste computador.
//
// Antes era um "rewrite" estático com a URL do túnel gravada no vercel.json (versionado). Qualquer pessoa que soubesse essa URL chamava o túnel direto
// e forjava o cabeçalho de IP, burlando a cota por pessoa. Agora:
//   - a URL do túnel e o segredo vêm de variáveis desta implantação (SINDI_TUNEL_URL, SINDI_REPASSE_SEGREDO), passadas por publicar.ps1, fora do git;
//   - o repasse assina cada pedido (x-sindi-repasse) e informa o IP do visitante (x-sindi-ip), que a aplicação só aceita com a assinatura certa;
//   - quem chama o túnel direto fica identificado pelo IP real (cf-connecting-ip, escrito pela Cloudflare).
export const config = { runtime: 'edge' };

// Cabeçalhos que o visitante não pode mandar adiante: os de assinatura e os de IP (a aplicação os reescreve a partir do repasse).
const BLOQUEADOS = ['x-sindi-repasse', 'x-sindi-ip', 'x-forwarded-for', 'x-real-ip', 'x-vercel-forwarded-for', 'cf-connecting-ip', 'host', 'connection'];

export default async function repasse(request) {
  const destino = process.env.SINDI_TUNEL_URL; const segredo = process.env.SINDI_REPASSE_SEGREDO;
  if (!destino || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$|^https:\/\/[a-z0-9.-]+$/.test(destino) || !segredo) {
    return new Response('A SINDI está fora do ar no momento.', { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const original = new URL(request.url);
  // O rewrite manda tudo para /api/repasse?caminho=<resto>; o caminho volta a ser o original, com a mesma consulta.
  const caminho = original.searchParams.get('caminho') ?? '';
  original.searchParams.delete('caminho');
  // O caminho vem do visitante: barra invertida, caractere de controle ou "//" fariam o parser de URL trocar de host (e o segredo iria junto).
  // Só caracteres de caminho comuns; e o destino final tem de ter exatamente a origem do túnel.
  if (!/^[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/.test(caminho) || caminho.includes('//')) return new Response('Endereço inválido.', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const base = new URL(destino);
  const alvo = new URL(base.origin);
  alvo.pathname = `/${caminho.replace(/^\/+/, '')}`; alvo.search = original.search;
  if (alvo.origin !== base.origin) return new Response('Endereço inválido.', { status: 400, headers: { 'Cache-Control': 'no-store' } });

  const cabecalhos = new Headers(request.headers);
  for (const nome of BLOQUEADOS) cabecalhos.delete(nome);
  cabecalhos.set('x-sindi-repasse', segredo);
  // Na borda da Vercel, x-real-ip é escrito pela própria Vercel com o IP de quem conectou.
  cabecalhos.set('x-sindi-ip', request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '');

  const resposta = await fetch(alvo, {
    method: request.method, headers: cabecalhos, redirect: 'manual',
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    duplex: 'half',
  });
  // O corpo segue em fluxo (o chat responde em NDJSON, pedaço a pedaço).
  const saida = new Headers(resposta.headers);
  saida.set('Cache-Control', saida.get('Cache-Control') ?? 'no-store');
  return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers: saida });
}
