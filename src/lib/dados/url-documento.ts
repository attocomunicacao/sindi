/** Endereço que pode ser guardado como fonte de um documento coletado: http, https ou ftp, sem credenciais. */
export function urlDeDocumentoValida(valor: string): boolean {
  try {
    const url = new URL(valor);
    return ['https:', 'http:', 'ftp:'].includes(url.protocol) && !url.username && !url.password && valor.length <= 2048;
  } catch {
    return false;
  }
}
