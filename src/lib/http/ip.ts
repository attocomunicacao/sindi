import { timingSafeEqual } from 'node:crypto';

/** O pedido veio pelo repasse da Vercel (deployment/vercel-proxy), que assina com `SINDI_REPASSE_SEGREDO`: só então o IP que ele informa é confiável. */
function repasseConfiavel(request: Request) {
  const esperado = process.env.SINDI_REPASSE_SEGREDO ?? '';
  const recebido = request.headers.get('x-sindi-repasse') ?? '';
  return (
    esperado.length >= 32 &&
    recebido.length === esperado.length &&
    timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  );
}
/**
 * IP do visitante. Ordem de confiança:
 * 1. repasse assinado da Vercel (`x-sindi-ip`, com o segredo certo);
 * 2. `SINDI_IP_HEADER`, se configurado (só esse cabeçalho);
 * 3. `cf-connecting-ip` primeiro, porque o túnel da Cloudflare o escreve e quem chama o túnel direto não consegue forjá-lo; depois os da Vercel.
 * Sem nenhum, todos caem em um mesmo grupo, que só o teto geral limita.
 */
export function ipDoPedido(request: Request) {
  if (repasseConfiavel(request)) {
    const ip = request.headers.get('x-sindi-ip')?.split(',')[0]?.trim();
    if (ip && ip.length <= 64) return ip;
  }
  const nomes = process.env.SINDI_IP_HEADER
    ? [process.env.SINDI_IP_HEADER]
    : ['cf-connecting-ip', 'x-vercel-forwarded-for', 'x-real-ip'];
  for (const nome of nomes) {
    const valor = request.headers.get(nome)?.split(',')[0]?.trim();
    if (valor && valor.length <= 64) return valor;
  }
  return 'desconhecido';
}
