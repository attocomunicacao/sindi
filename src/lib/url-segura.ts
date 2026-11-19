/** Sem dependências: usado também por componentes do navegador. Só links http(s) sem credenciais viram `href`; qualquer outro esquema (javascript:, data:, file:) vira "#". */
export function linkSeguro(valor: string | null | undefined): string {
  if (!valor) return '#';
  try {
    const url = new URL(valor);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? valor : '#';
  } catch { return '#'; }
}
/** Endereço que pode ser guardado como fonte de um documento coletado: http, https ou ftp, sem credenciais. */
export function urlDeDocumentoValida(valor: string): boolean {
  try {
    const url = new URL(valor);
    return ['https:', 'http:', 'ftp:'].includes(url.protocol) && !url.username && !url.password && valor.length <= 2048;
  } catch { return false; }
}
