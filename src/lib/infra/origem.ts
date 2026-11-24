// Um proxy reverso preserva o Origin do navegador e troca o Host no destino.
// Confia-se em uma única configuração explícita do servidor, nunca em hosts repassados pelo cliente.
export function origemConfiavel(origem: string | null, hostEsperado: string, origemPublica = '', vercel = false): boolean {
  try {
    const analisada = new URL(origem || '');
    if (!['http:', 'https:'].includes(analisada.protocol) || (vercel && analisada.protocol !== 'https:')) return false;
    if (origem !== analisada.origin) return false;
    if (analisada.host === hostEsperado) return true;
    return analisada.protocol === 'https:' && Boolean(origemPublica) && analisada.origin === origemPublica;
  } catch { return false; }
}
