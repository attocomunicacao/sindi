/**
 * Endereço de um serviço oficial da Receita (calculadoras RTC) rodando nesta máquina. Só aceita 127.0.0.1, localhost ou ::1, sem usuário nem senha:
 * o serviço nunca vira uma porta para a rede interna (SSRF). Qualquer outro valor desliga a integração, e quem chama usa a conta do SINDI.
 */
export function enderecoLocal(valor: string | undefined) {
  if (!valor?.trim()) return undefined;
  try {
    const url = new URL(valor.trim());
    return /^https?:$/.test(url.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password
      ? `${url.origin}${url.pathname.replace(/\/+$/, '')}`
      : undefined;
  } catch {
    return undefined;
  }
}
