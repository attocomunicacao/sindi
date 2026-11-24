import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { A4, seguro } from '@/lib/pdf/base';
import { dataEHoraBR } from '@/lib/base/formato';
import type { Dashboard, Par } from '@/lib/dados/dashboard';

const TINTA = rgb(0.176, 0.153, 0.153);
const OURO = rgb(0.922, 0.725, 0.18);
const VERMELHO = rgb(0.714, 0.075, 0.137);
const VERDE = rgb(0.18, 0.49, 0.36);
const COR_DO_TEXTO = rgb(0.12, 0.1, 0.1);
const SUAVE = rgb(0.41, 0.37, 0.35);
const COR_DA_LINHA = rgb(0.9, 0.88, 0.85);
const FUNDO_SUAVE = rgb(0.953, 0.937, 0.914);
const FANTASMA = rgb(0.82, 0.8, 0.76);
const BRANCO = rgb(1, 1, 1);
const MARGEM = 36;
const LARGURA_UTIL = A4.width - MARGEM * 2;
const ESPACO = 10;

/** A página e as duas fontes, com os dois gestos que todos os blocos repetem: escrever texto e desenhar uma caixa. */
type Desenho = {
  pagina: PDFPage;
  normal: PDFFont;
  texto: (
    t: string,
    x: number,
    y: number,
    size: number,
    o?: { bold?: boolean; color?: ReturnType<typeof rgb>; right?: boolean },
  ) => void;
  caixa: (x: number, y: number, w: number, h: number) => void;
};

function criarDesenho(pagina: PDFPage, normal: PDFFont, negrito: PDFFont): Desenho {
  const texto: Desenho['texto'] = (t, x, y, size, o = {}) => {
    const f: PDFFont = o.bold ? negrito : normal;
    const s = seguro(t);
    const w = f.widthOfTextAtSize(s, size);
    pagina.drawText(s, { x: o.right ? x - w : x, y, size, font: f, color: o.color ?? COR_DO_TEXTO });
  };
  const caixa: Desenho['caixa'] = (x, y, w, h) =>
    pagina.drawRectangle({ x, y, width: w, height: h, color: BRANCO, borderColor: COR_DA_LINHA, borderWidth: 0.8 });
  return { pagina, normal, texto, caixa };
}

function faixaDeTitulo({ pagina, texto }: Desenho, d: Dashboard) {
  pagina.drawRectangle({ x: 0, y: A4.height - 92, width: A4.width, height: 92, color: TINTA });
  pagina.drawRectangle({ x: MARGEM, y: A4.height - 40, width: 28, height: 3, color: OURO });
  texto('Painel do setor', MARGEM, A4.height - 62, 22, { bold: true, color: BRANCO });
  texto('SINDEPRESTEM · SINDI · indicadores econômicos e de emprego', MARGEM, A4.height - 80, 9, {
    color: rgb(0.85, 0.82, 0.78),
  });
  const atualizado = d.atualizadoEm ? dataEHoraBR(d.atualizadoEm) : '—';
  texto(`Atualizado em ${atualizado}`, A4.width - MARGEM, A4.height - 62, 9, {
    color: rgb(0.85, 0.82, 0.78),
    right: true,
  });
  texto(`Referências: ${d.periodos}`, A4.width - MARGEM, A4.height - 76, 8, {
    color: rgb(0.7, 0.66, 0.62),
    right: true,
  });
}

/** Quatro cartões KPI lado a lado; devolve a altura do cartão. */
function cartoesKpi({ pagina, texto, caixa }: Desenho, d: Dashboard, y: number): number {
  const kw = (LARGURA_UTIL - ESPACO * 3) / 4;
  const kh = 104;
  d.kpis.slice(0, 4).forEach((k, i) => {
    const x = MARGEM + i * (kw + ESPACO);
    caixa(x, y - kh, kw, kh);
    pagina.drawRectangle({ x, y: y - 3, width: kw, height: 3, color: OURO });
    texto(k.rotulo.toUpperCase(), x + 12, y - 22, 7, { bold: true, color: SUAVE });
    texto(k.valor, x + 12, y - 48, 19, { bold: true });
    texto(k.unidade, x + 12, y - 61, 7, { color: SUAVE });
    const cor = k.favoravel === null ? SUAVE : k.favoravel ? VERDE : VERMELHO;
    if (k.delta) texto(k.delta, x + 12, y - 78, 8, { bold: true, color: cor });
    texto(`${k.anterior ? `anterior ${k.anterior} · ` : ''}ref. ${k.periodo}`, x + 12, y - 92, 6.5, { color: SUAVE });
  });
  return kh;
}

/** Uma barra (fundo + valor + rótulo à direita) de um par atual/anterior. */
function barraDoPar(
  { pagina, texto }: Desenho,
  bx: number,
  bw: number,
  lo: number,
  faixa: number,
  v: number,
  yb: number,
  cor: ReturnType<typeof rgb>,
  rotulo: string,
  forte: boolean,
) {
  pagina.drawRectangle({ x: bx, y: yb, width: bw, height: 7, color: FUNDO_SUAVE });
  const w = Math.max((Math.abs(v) / faixa) * bw, v === 0 ? 0 : 1.5);
  pagina.drawRectangle({ x: bx + ((Math.min(0, v) - lo) / faixa) * bw, y: yb, width: w, height: 7, color: cor });
  texto(rotulo, bx + bw + 58, yb, forte ? 8.5 : 7, {
    bold: forte,
    color: forte ? COR_DO_TEXTO : SUAVE,
    right: true,
  });
}

/** Gráfico de barras pareadas (atual em dourado, anterior em cinza); devolve a altura da caixa. */
function graficoDeBarras(
  des: Desenho,
  titulo: string,
  nota: string,
  linhas: Par[],
  escala: 'global' | 'linha',
  x: number,
  largura: number,
  topo: number,
): number {
  const { texto, caixa } = des;
  const h = 60 + linhas.length * 38;
  caixa(x, topo - h, largura, h);
  texto(titulo, x + 14, topo - 24, 11, { bold: true });
  texto(nota, x + 14, topo - 37, 6.8, { color: SUAVE });
  const valores = linhas.flatMap((l) => [l.atual, l.anterior ?? 0]);
  const gLo = Math.min(0, ...valores);
  const gHi = Math.max(0, ...valores);
  const bx = x + 14;
  const bw = largura - 28 - 62;
  linhas.forEach((l, i) => {
    const yy = topo - 62 - i * 38;
    const lo = escala === 'global' ? gLo : Math.min(0, l.atual, l.anterior ?? 0);
    const hi = escala === 'global' ? gHi : Math.max(0, l.atual, l.anterior ?? 0);
    const faixa = hi - lo || 1;
    texto(l.rotulo, bx, yy, 8.5, { bold: true });
    barraDoPar(des, bx, bw, lo, faixa, l.atual, yy - 14, OURO, l.atualTexto, true);
    if (l.anterior !== null)
      barraDoPar(des, bx, bw, lo, faixa, l.anterior, yy - 26, FANTASMA, l.anteriorTexto ?? '', false);
  });
  return h;
}

/** Uma série de colunas mensais dentro da célula que começa em (cx, cy). */
function colunasDaSerie(
  { pagina, normal, texto }: Desenho,
  serie: Dashboard['series'][number],
  cx: number,
  cy: number,
  celW: number,
) {
  const ultimo = serie.pontos[serie.pontos.length - 1];
  texto(serie.rotulo, cx, cy, 8.5, { bold: true });
  texto(`${ultimo.valor.toLocaleString('pt-BR')} em ${ultimo.rotulo}`, cx + celW, cy, 8.5, {
    bold: true,
    right: true,
  });
  const valores = serie.pontos.map((p) => p.valor);
  const lo = Math.min(0, ...valores);
  const hi = Math.max(0, ...valores);
  const faixa = hi - lo || 1;
  const altoGraf = 34;
  const zeroY = cy - 22 - (hi / faixa) * altoGraf;
  const passo = celW / serie.pontos.length;
  const bw = Math.min(30, passo - 14);
  pagina.drawLine({ start: { x: cx, y: zeroY }, end: { x: cx + celW, y: zeroY }, thickness: 0.6, color: FANTASMA });
  serie.pontos.forEach((p, k) => {
    const barH = Math.max((Math.abs(p.valor) / faixa) * altoGraf, 1.2);
    const bx = cx + passo * k + (passo - bw) / 2;
    const atual = k === serie.pontos.length - 1;
    pagina.drawRectangle({
      x: bx,
      y: p.valor >= 0 ? zeroY : zeroY - barH,
      width: bw,
      height: barH,
      color: p.valor < 0 ? VERMELHO : OURO,
      opacity: atual ? 1 : 0.55,
    });
    texto(
      p.texto,
      bx + bw / 2 - normal.widthOfTextAtSize(seguro(p.texto), 6.5) / 2,
      p.valor >= 0 ? zeroY + barH + 3 : zeroY - barH - 8,
      6.5,
      { bold: atual, color: atual ? COR_DO_TEXTO : SUAVE },
    );
    texto(p.rotulo, bx + bw / 2 - normal.widthOfTextAtSize(seguro(p.rotulo), 6.5) / 2, cy - 22 - altoGraf - 24, 6.5, {
      color: SUAVE,
    });
  });
}

/** Evolução mensal do saldo de emprego formal: colunas por mês (dourado positivo, vermelho negativo), uma escala por gráfico, como na página. */
function graficoDeColunas(
  des: Desenho,
  titulo: string,
  nota: string,
  series: Dashboard['series'],
  x: number,
  largura: number,
  topo: number,
): number {
  const { texto, caixa } = des;
  const celH = 88;
  const linhas = Math.ceil(series.length / 2);
  const h = 46 + linhas * celH;
  caixa(x, topo - h, largura, h);
  texto(titulo, x + 14, topo - 24, 11, { bold: true });
  texto(nota, x + 14, topo - 37, 6.8, { color: SUAVE });
  const celW = (largura - 28 - 16) / 2;
  series.forEach((serie, i) => {
    const cx = x + 14 + (i % 2) * (celW + 16);
    const cy = topo - 52 - Math.floor(i / 2) * celH; // cy: topo da célula
    colunasDaSerie(des, serie, cx, cy, celW);
  });
  return h;
}

function blocoDerivados({ texto, caixa }: Desenho, d: Dashboard, y: number) {
  if (!d.derivados.length) return;
  const dw = (LARGURA_UTIL - ESPACO * (d.derivados.length - 1)) / d.derivados.length;
  d.derivados.forEach((x, i) => {
    const xx = MARGEM + i * (dw + ESPACO);
    caixa(xx, y - 62, dw, 62);
    texto(x.rotulo, xx + 10, y - 18, 7, { bold: true, color: SUAVE });
    texto(x.valor, xx + 10, y - 40, 14, { bold: true });
    texto(x.nota, xx + 10, y - 54, 6.5, { color: SUAVE });
  });
}

function rodapeDeFontes({ texto }: Desenho) {
  texto(
    'Fontes: Banco Central, IBGE e Ministério do Trabalho (Novo CAGED), coletadas pela SINDI. Cada indicador traz valor atual e anterior; não há série histórica.',
    MARGEM,
    34,
    6.5,
    { color: SUAVE },
  );
  texto(
    'Valores derivados são cálculos simples sobre esses dados. Documento informativo, sem valor jurídico.',
    MARGEM,
    25,
    6.5,
    { color: SUAVE },
  );
}

/** Dashboard em uma página A4 (retrato): faixa de título, quatro cartões KPI, dois gráficos de barras pareadas e indicadores derivados. */
export async function pdfDoDashboard(d: Dashboard): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Painel do setor — SINDI');
  pdf.setCreator('SINDI');
  pdf.setProducer('SINDI');
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pagina = pdf.addPage([A4.width, A4.height]);
  const des = criarDesenho(pagina, normal, negrito);

  faixaDeTitulo(des, d);
  let y = A4.height - 92 - 24;
  y -= cartoesKpi(des, d, y) + 18;
  const h1 = d.series.length
    ? graficoDeColunas(
        des,
        'Emprego formal: saldo de vagas por mês',
        'Novo CAGED. Dourado: saldo positivo; vermelho: negativo; última coluna: mês mais recente. Escala própria por gráfico.',
        d.series,
        MARGEM,
        LARGURA_UTIL,
        y,
      )
    : graficoDeBarras(
        des,
        'Saldo de emprego formal',
        'Vagas no mês: atual (dourado) e anterior (cinza). Novo CAGED.',
        d.emprego,
        'global',
        MARGEM,
        LARGURA_UTIL,
        y,
      );
  y -= h1 + 12;
  const h2 = graficoDeBarras(
    des,
    'Juros, preços e atividade',
    'Em %: atual (dourado) e anterior (cinza). Escala própria por linha.',
    d.taxas,
    'linha',
    MARGEM,
    LARGURA_UTIL,
    y,
  );
  y -= h2 + 12;
  blocoDerivados(des, d, y);
  rodapeDeFontes(des);
  return pdf.save();
}
