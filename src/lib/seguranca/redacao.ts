// ── Dados pessoais e confidenciais ────────────────────────────────────────────────────────────────────────────────────────────────
// A SINDI não grava conversas, mas o texto ainda passa pelo modelo e pelo histórico da sessão. Por isso, ao detectar CPF, cartão, senha ou
// token, a pergunta não chega ao modelo e o trecho é removido do histórico. A decisão é por regras no servidor, fora do modelo.
const luhn = (digitos: string) => { let soma = 0; let dobra = false; for (let i = digitos.length - 1; i >= 0; i--) { let n = Number(digitos[i]); if (dobra) { n *= 2; if (n > 9) n -= 9; } soma += n; dobra = !dobra; } return soma % 10 === 0; };
const CPF_FORMATADO = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g;
const CPF_ROTULADO = /\b(?:cpf|rg|cnh|passaporte)\b[^\d\n]{0,15}\d[\d.\-/ ]{5,}\d/gi;
const SEGREDO_ROTULADO = /\b(?:senha|password|token|cvv|pin|chave de api|api key|c[oó]digo de seguran[cç]a)\b\s*(?:[:=]|(?:\w+\s+){0,3}(?:é|e|eh|is)\s)\s*(?=\S*\d)\S+/gi;
const CARTAO = /(?<![\d.])(?:\d[ -]?){12,18}\d(?![\d.])/g;
/** CPF só com dígitos: 11 dígitos isolados que passam nos dois dígitos verificadores (um número de telefone ou de protocolo quase nunca passa). */
const CPF_SEM_FORMATO = /(?<![\d.\-/])\d{11}(?![\d.\-/])/g;
const cpfValido = (d: string) => {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number) => { let soma = 0; for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i); const r = (soma * 10) % 11; return r === 10 ? 0 : r; };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
};
/** Chaves e tokens de formato conhecido, mesmo sem a palavra "senha" ou "token" ao lado: Google (AIza), OpenAI/Anthropic (sk-), GitHub, Slack, AWS e JWT. */
const TOKEN_CONHECIDO = /\b(?:AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/g;
/** Trechos de `texto` que parecem dado pessoal ou segredo (CPF, documento rotulado, cartão válido pelo algoritmo de Luhn, senha ou token informados). */
function achadosSensiveis(texto: string): string[] {
  const achados = [...(texto.match(CPF_FORMATADO) ?? []), ...(texto.match(CPF_ROTULADO) ?? []), ...(texto.match(SEGREDO_ROTULADO) ?? []), ...(texto.match(TOKEN_CONHECIDO) ?? []), ...(texto.match(CPF_SEM_FORMATO) ?? []).filter(cpfValido)];
  for (const candidato of texto.match(CARTAO) ?? []) { const digitos = candidato.replace(/\D/g, ''); if (digitos.length >= 13 && digitos.length <= 19 && luhn(digitos)) achados.push(candidato); }
  return achados;
}
export function contemDadosSensiveis(texto: string): boolean { return achadosSensiveis(texto).length > 0; }
/** Remove do texto os dados pessoais e segredos detectados, para que não voltem ao modelo pelo histórico da conversa. */
export function redigirDadosSensiveis(texto: string): string {
  return achadosSensiveis(texto).reduce((atual, achado) => atual.split(achado).join('[dado sensível removido]'), texto);
}
