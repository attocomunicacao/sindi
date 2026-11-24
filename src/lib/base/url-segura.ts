/** Sem dependências: usado também por componentes do navegador. Só links http(s) sem credenciais viram `href`; qualquer outro esquema (javascript:, data:, file:) vira "#". */
export function linkSeguro(valor: string | null | undefined): string {
  if (!valor) return '#';
  try {
    const url = new URL(valor);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? valor : '#';
  } catch {
    return '#';
  }
}
