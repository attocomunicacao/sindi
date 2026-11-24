/**
 * PDF mínimo e válido só com texto (Helvetica, WinAnsi), para testar coletores que leem PDF sem guardar um arquivo binário no repositório.
 * Cada linha vira uma linha de texto; 45 linhas por página. Acentos do português cabem em WinAnsi (== latin1).
 */
export function pdfComTexto(texto: string): Uint8Array {
  const linhas = texto.split('\n');
  const paginas: string[][] = [];
  for (let i = 0; i < linhas.length; i += 45) paginas.push(linhas.slice(i, i + 45));
  if (!paginas.length) paginas.push(['']);
  const escapar = (l: string) => l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  // Objetos: 1 catálogo, 2 páginas, 3 fonte, depois (página, conteúdo) para cada página.
  const objetos: string[] = [];
  const filhas = paginas.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objetos.push('<< /Type /Catalog /Pages 2 0 R >>');
  objetos.push(`<< /Type /Pages /Kids [${filhas}] /Count ${paginas.length} >>`);
  objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  paginas.forEach((linhasDaPagina, i) => {
    const fluxo = `BT /F1 10 Tf 12 TL 40 800 Td ${linhasDaPagina.map((l) => `(${escapar(l)}) '`).join(' ')} ET`;
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    objetos.push(`<< /Length ${Buffer.byteLength(fluxo, 'latin1')} >>\nstream\n${fluxo}\nendstream`);
  });
  let saida = '%PDF-1.4\n';
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(Buffer.byteLength(saida, 'latin1'));
    saida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const inicioDaTabela = Buffer.byteLength(saida, 'latin1');
  saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) saida += `${String(p).padStart(10, '0')} 00000 n \n`;
  saida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioDaTabela}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(saida, 'latin1'));
}
