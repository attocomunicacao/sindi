import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

export const A4 = { width: 595.28, height: 841.89 };
export const MARGEM = 42;
export const COR = { texto: rgb(0.1, 0.13, 0.18), suave: rgb(0.4, 0.45, 0.52), linha: rgb(0.85, 0.87, 0.9), fundo: rgb(0.96, 0.97, 0.98), marca: rgb(0, 0.15, 0.29), destaque: rgb(0.92, 0.72, 0.18), branco: rgb(1, 1, 1) };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moeda = (valor: number) => brl.format(Math.abs(valor) < 0.005 ? 0 : valor);
export const percentual = (valor: number, casas = 2) => `${(valor * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
export const numero = (valor: number, casas = 0) => valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Caracteres disponíveis na codificação WinAnsi das fontes padrão do PDF (Windows-1252).
const EXTRAS_1252 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const SUBSTITUICOES: Record<string, string> = { '−': '-', '→': '->', '≥': '>=', '≤': '<=', '≈': '~', ' ': ' ', '​': '', ' ': ' ' };
/** Troca caracteres que a fonte padrão do PDF não consegue desenhar. */
export function seguro(texto: string) {
  let saida = '';
  for (const c of texto.normalize('NFC').replace(/\r/g, '')) {
    const sub = SUBSTITUICOES[c]; if (sub !== undefined) { saida += sub; continue; }
    const code = c.codePointAt(0)!;
    saida += c === '\n' || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || EXTRAS_1252.has(c) ? c : '?';
  }
  return saida;
}

export type Coluna = { titulo: string; largura: number; alinhar?: 'esquerda' | 'direita' | 'centro' };
export type OpcoesTabela = { zebra?: boolean; negrito?: Set<number>; destaque?: Set<number>; tamanho?: number };

/** Construtor de documentos A4 com quebra de página, cabeçalho de tabela repetido e rodapé numerado. */
export class Documento {
  pdf!: PDFDocument; normal!: PDFFont; negrito!: PDFFont; pagina!: PDFPage; y = 0; paginas: PDFPage[] = [];
  constructor(private titulo: string, private rodape: string) {}
  static async criar(titulo: string, rodape: string) {
    const doc = new Documento(titulo, rodape);
    doc.pdf = await PDFDocument.create();
    doc.pdf.setTitle(titulo); doc.pdf.setCreator('SINDI'); doc.pdf.setProducer('SINDI'); doc.pdf.setCreationDate(new Date());
    doc.normal = await doc.pdf.embedFont(StandardFonts.Helvetica); doc.negrito = await doc.pdf.embedFont(StandardFonts.HelveticaBold);
    doc.novaPagina();
    return doc;
  }
  get largura() { return A4.width - MARGEM * 2; }
  novaPagina() {
    this.pagina = this.pdf.addPage([A4.width, A4.height]); this.paginas.push(this.pagina); this.y = A4.height - MARGEM;
  }
  garantir(altura: number) { if (this.y - altura < MARGEM + 24) this.novaPagina(); }
  /** Quebra o texto em linhas que cabem em `largura`. */
  quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number) {
    const linhas: string[] = [];
    for (const paragrafo of seguro(texto).split('\n')) {
      let atual = '';
      for (const palavra of paragrafo.split(' ')) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura || !atual) atual = tentativa; else { linhas.push(atual); atual = palavra; }
      }
      linhas.push(atual);
    }
    return linhas;
  }
  texto(texto: string, opcoes: { tamanho?: number; negrito?: boolean; cor?: RGB; x?: number; largura?: number; espaco?: number } = {}) {
    const tamanho = opcoes.tamanho ?? 9.5; const fonte = opcoes.negrito ? this.negrito : this.normal; const x = opcoes.x ?? MARGEM; const largura = opcoes.largura ?? this.largura - (x - MARGEM);
    for (const linha of this.quebrar(texto, fonte, tamanho, largura)) {
      this.garantir(tamanho + 4); this.y -= tamanho + 2;
      this.pagina.drawText(linha, { x, y: this.y, size: tamanho, font: fonte, color: opcoes.cor ?? COR.texto });
    }
    this.y -= opcoes.espaco ?? 4;
  }
  marcadores(itens: string[], tamanho = 9) {
    for (const item of itens) {
      const linhas = this.quebrar(item, this.normal, tamanho, this.largura - 14);
      this.garantir((tamanho + 3) * linhas.length);
      this.pagina.drawCircle({ x: MARGEM + 4, y: this.y - tamanho + 1.5, size: 1.4, color: COR.marca });
      for (const linha of linhas) { this.y -= tamanho + 2; this.pagina.drawText(linha, { x: MARGEM + 14, y: this.y, size: tamanho, font: this.normal, color: COR.texto }); }
      this.y -= 2;
    }
    this.y -= 4;
  }
  titulo2(texto: string) {
    this.garantir(34); this.y -= 8;
    this.pagina.drawRectangle({ x: MARGEM, y: this.y - 17, width: 3, height: 15, color: COR.destaque });
    this.pagina.drawText(seguro(texto), { x: MARGEM + 9, y: this.y - 13, size: 11.5, font: this.negrito, color: COR.marca });
    this.y -= 24;
  }
  espaco(valor: number) { this.y -= valor; }
  /** Faixa de cabeçalho da primeira página. */
  capa(titulo: string, subtitulo: string, direita: string) {
    this.pagina.drawRectangle({ x: 0, y: A4.height - 92, width: A4.width, height: 92, color: COR.marca });
    this.pagina.drawRectangle({ x: 0, y: A4.height - 95, width: A4.width, height: 3, color: COR.destaque });
    this.pagina.drawText(seguro(titulo), { x: MARGEM, y: A4.height - 44, size: 19, font: this.negrito, color: COR.branco });
    this.pagina.drawText(seguro(subtitulo), { x: MARGEM, y: A4.height - 64, size: 9.5, font: this.normal, color: rgb(0.85, 0.89, 0.94) });
    const largura = this.normal.widthOfTextAtSize(seguro(direita), 9);
    this.pagina.drawText(seguro(direita), { x: A4.width - MARGEM - largura, y: A4.height - 44, size: 9, font: this.normal, color: rgb(0.85, 0.89, 0.94) });
    this.y = A4.height - 118;
  }
  campos(pares: [string, string][], colunas = 2) {
    const largura = this.largura / colunas;
    for (let i = 0; i < pares.length; i += colunas) {
      this.garantir(30);
      pares.slice(i, i + colunas).forEach(([rotulo, valor], k) => {
        this.pagina.drawText(seguro(rotulo.toUpperCase()), { x: MARGEM + k * largura, y: this.y - 8, size: 7, font: this.negrito, color: COR.suave });
        const linhas = this.quebrar(valor || '—', this.normal, 9.5, largura - 10); this.pagina.drawText(linhas[0], { x: MARGEM + k * largura, y: this.y - 20, size: 9.5, font: this.normal, color: COR.texto });
      });
      this.y -= 28;
    }
  }
  /** Quadro de destaques numéricos ("Valor mensal", "Valor anual"...). */
  destaques(itens: { rotulo: string; valor: string; principal?: boolean }[]) {
    this.garantir(60); const largura = this.largura / itens.length;
    this.pagina.drawRectangle({ x: MARGEM, y: this.y - 52, width: this.largura, height: 52, color: COR.fundo, borderColor: COR.linha, borderWidth: 0.8 });
    itens.forEach((item, k) => {
      const x = MARGEM + k * largura + 12;
      this.pagina.drawText(seguro(item.rotulo.toUpperCase()), { x, y: this.y - 17, size: 7, font: this.negrito, color: COR.suave });
      this.pagina.drawText(seguro(item.valor), { x, y: this.y - 39, size: item.principal ? 17 : 13, font: this.negrito, color: item.principal ? COR.marca : COR.texto });
    });
    this.y -= 66;
  }
  tabela(colunas: Coluna[], linhas: string[][], opcoes: OpcoesTabela = {}) {
    const tamanho = opcoes.tamanho ?? 8.5; const alturaLinha = tamanho + 7;
    const cabecalho = () => {
      this.garantir(alturaLinha * 2);
      this.pagina.drawRectangle({ x: MARGEM, y: this.y - alturaLinha, width: this.largura, height: alturaLinha, color: COR.marca });
      let x = MARGEM;
      for (const c of colunas) { this.celula(c.titulo, x, this.y - alturaLinha + 5, c, this.negrito, tamanho, COR.branco); x += c.largura; }
      this.y -= alturaLinha;
    };
    cabecalho();
    linhas.forEach((linha, indice) => {
      const quebras = linha.map((texto, k) => this.quebrar(texto, opcoes.negrito?.has(indice) ? this.negrito : this.normal, tamanho, colunas[k].largura - 8));
      const altura = Math.max(...quebras.map(q => q.length)) * (tamanho + 2) + 5;
      if (this.y - altura < MARGEM + 24) { this.novaPagina(); cabecalho(); }
      if (opcoes.destaque?.has(indice)) this.pagina.drawRectangle({ x: MARGEM, y: this.y - altura, width: this.largura, height: altura, color: rgb(0.99, 0.95, 0.82) });
      else if (opcoes.zebra !== false && indice % 2 === 1) this.pagina.drawRectangle({ x: MARGEM, y: this.y - altura, width: this.largura, height: altura, color: COR.fundo });
      let x = MARGEM;
      quebras.forEach((q, k) => { q.forEach((texto, n) => this.celula(texto, x, this.y - tamanho - 3 - n * (tamanho + 2), colunas[k], opcoes.negrito?.has(indice) ? this.negrito : this.normal, tamanho, COR.texto, true)); x += colunas[k].largura; });
      this.pagina.drawLine({ start: { x: MARGEM, y: this.y - altura }, end: { x: MARGEM + this.largura, y: this.y - altura }, thickness: 0.4, color: COR.linha });
      this.y -= altura;
    });
    this.y -= 8;
  }
  private celula(texto: string, x: number, y: number, coluna: Coluna, fonte: PDFFont, tamanho: number, cor: RGB, jaSeguro = false) {
    const t = jaSeguro ? texto : seguro(texto); const w = fonte.widthOfTextAtSize(t, tamanho);
    const px = coluna.alinhar === 'direita' ? x + coluna.largura - 5 - w : coluna.alinhar === 'centro' ? x + (coluna.largura - w) / 2 : x + 5;
    this.pagina.drawText(t, { x: px, y, size: tamanho, font: fonte, color: cor });
  }
  /** Barras horizontais de proporção (composição do preço). */
  barras(itens: { rotulo: string; valor: number; texto: string }[]) {
    const maximo = Math.max(...itens.map(i => i.valor), 0.0001); const larguraBarra = this.largura - 215;
    for (const item of itens) {
      this.garantir(18);
      this.pagina.drawText(seguro(item.rotulo), { x: MARGEM, y: this.y - 11, size: 8.5, font: this.normal, color: COR.texto });
      this.pagina.drawRectangle({ x: MARGEM + 150, y: this.y - 13, width: larguraBarra, height: 9, color: COR.fundo });
      this.pagina.drawRectangle({ x: MARGEM + 150, y: this.y - 13, width: Math.max(1, (item.valor / maximo) * larguraBarra), height: 9, color: COR.marca });
      this.pagina.drawText(seguro(item.texto), { x: MARGEM + 156 + larguraBarra, y: this.y - 11, size: 8.5, font: this.negrito, color: COR.texto });
      this.y -= 17;
    }
    this.y -= 6;
  }
  async bytes() {
    this.paginas.forEach((pagina, i) => {
      pagina.drawLine({ start: { x: MARGEM, y: MARGEM }, end: { x: A4.width - MARGEM, y: MARGEM }, thickness: 0.5, color: COR.linha });
      pagina.drawText(seguro(this.rodape), { x: MARGEM, y: MARGEM - 12, size: 7, font: this.normal, color: COR.suave });
      const marca = `Página ${i + 1} de ${this.paginas.length}`; pagina.drawText(marca, { x: A4.width - MARGEM - this.normal.widthOfTextAtSize(marca, 7), y: MARGEM - 12, size: 7, font: this.normal, color: COR.suave });
    });
    return this.pdf.save();
  }
}
