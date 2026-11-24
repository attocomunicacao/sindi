// Só roda no navegador (usa o DOM); sem imports de Node, então componentes 'use client' podem importar.

/** Entrega um arquivo ao usuário: cria um link temporário para o blob, clica nele e só depois libera a memória (o download precisa ter começado). */
export function baixarArquivo(arquivo: Blob, nome: string) {
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
