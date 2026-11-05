import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { A4, seguro } from '../orcamento/pdf-base';
import type { Dashboard, Par } from './dashboard';

const INK = rgb(0.176, 0.153, 0.153); const GOLD = rgb(0.922, 0.725, 0.18); const RED = rgb(0.714, 0.075, 0.137); const GREEN = rgb(0.18, 0.49, 0.36);
const TEXT = rgb(0.12, 0.1, 0.1); const MUTED = rgb(0.41, 0.37, 0.35); const LINE = rgb(0.9, 0.88, 0.85); const SOFT = rgb(0.953, 0.937, 0.914); const GHOST = rgb(0.82, 0.8, 0.76); const WHITE = rgb(1, 1, 1);
const M = 36; const W = A4.width - M * 2;

/** Dashboard em uma página A4 (retrato): faixa de título, quatro cartões KPI, dois gráficos de barras pareadas e indicadores derivados. */
export async function dashboardPdf(d: Dashboard): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Painel do setor — SINDI'); pdf.setCreator('SINDI'); pdf.setProducer('SINDI');
  const normal = await pdf.embedFont(StandardFonts.Helvetica); const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.width, A4.height]);
  const texto = (t: string, x: number, y: number, size: number, o: { bold?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const f: PDFFont = o.bold ? negrito : normal; const s = seguro(t); const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: o.right ? x - w : x, y, size, font: f, color: o.color ?? TEXT });
  };
  const caixa = (x: number, y: number, w: number, h: number) => page.drawRectangle({ x, y, width: w, height: h, color: WHITE, borderColor: LINE, borderWidth: 0.8 });

  // Faixa de título
  page.drawRectangle({ x: 0, y: A4.height - 92, width: A4.width, height: 92, color: INK });
  page.drawRectangle({ x: M, y: A4.height - 40, width: 28, height: 3, color: GOLD });
  texto('Painel do setor', M, A4.height - 62, 22, { bold: true, color: WHITE });
  texto('SINDEPRESTEM · SINDI · indicadores econômicos e de emprego', M, A4.height - 80, 9, { color: rgb(0.85, 0.82, 0.78) });
  const atualizado = d.atualizadoEm ? new Date(d.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
  texto(`Atualizado em ${atualizado}`, A4.width - M, A4.height - 62, 9, { color: rgb(0.85, 0.82, 0.78), right: true });
  texto(`Referências: ${d.periodos}`, A4.width - M, A4.height - 76, 8, { color: rgb(0.7, 0.66, 0.62), right: true });

  // KPIs
  let y = A4.height - 92 - 24; const gap = 10; const kw = (W - gap * 3) / 4; const kh = 104;
  d.kpis.slice(0, 4).forEach((k, i) => {
    const x = M + i * (kw + gap); caixa(x, y - kh, kw, kh);
    page.drawRectangle({ x, y: y - 3, width: kw, height: 3, color: GOLD });
    texto(k.rotulo.toUpperCase(), x + 12, y - 22, 7, { bold: true, color: MUTED });
    texto(k.valor, x + 12, y - 48, 19, { bold: true });
    texto(k.unidade, x + 12, y - 61, 7, { color: MUTED });
    const cor = k.favoravel === null ? MUTED : k.favoravel ? GREEN : RED;
    if (k.delta) texto(k.delta, x + 12, y - 78, 8, { bold: true, color: cor });
    texto(`${k.anterior ? `anterior ${k.anterior} · ` : ''}ref. ${k.periodo}`, x + 12, y - 92, 6.5, { color: MUTED });
  });
  y -= kh + 18;

  // Gráfico de barras pareadas
  const grafico = (titulo: string, nota: string, linhas: Par[], escala: 'global' | 'linha', x: number, largura: number, topo: number) => {
    const h = 60 + linhas.length * 38; caixa(x, topo - h, largura, h);
    texto(titulo, x + 14, topo - 24, 11, { bold: true }); texto(nota, x + 14, topo - 37, 6.8, { color: MUTED });
    const valores = linhas.flatMap(l => [l.atual, l.anterior ?? 0]); const gLo = Math.min(0, ...valores); const gHi = Math.max(0, ...valores);
    const bx = x + 14; const bw = largura - 28 - 62;
    linhas.forEach((l, i) => {
      const yy = topo - 62 - i * 38; const lo = escala === 'global' ? gLo : Math.min(0, l.atual, l.anterior ?? 0); const hi = escala === 'global' ? gHi : Math.max(0, l.atual, l.anterior ?? 0); const faixa = hi - lo || 1;
      texto(l.rotulo, bx, yy, 8.5, { bold: true });
      const barra = (v: number, yb: number, cor: ReturnType<typeof rgb>, rotulo: string, forte: boolean) => {
        page.drawRectangle({ x: bx, y: yb, width: bw, height: 7, color: SOFT });
        const w = Math.max(Math.abs(v) / faixa * bw, v === 0 ? 0 : 1.5);
        page.drawRectangle({ x: bx + (Math.min(0, v) - lo) / faixa * bw, y: yb, width: w, height: 7, color: cor });
        texto(rotulo, bx + bw + 58, yb, forte ? 8.5 : 7, { bold: forte, color: forte ? TEXT : MUTED, right: true });
      };
      barra(l.atual, yy - 14, GOLD, l.atualTexto, true);
      if (l.anterior !== null) barra(l.anterior, yy - 26, GHOST, l.anteriorTexto ?? '', false);
    });
    return h;
  };
  // Evolução mensal do saldo de emprego formal: colunas por mês (dourado positivo, vermelho negativo), uma escala por gráfico, como na página.
  const colunas = (titulo: string, nota: string, series: Dashboard['series'], x: number, largura: number, topo: number) => {
    const celH = 88; const linhas = Math.ceil(series.length / 2); const h = 46 + linhas * celH; caixa(x, topo - h, largura, h);
    texto(titulo, x + 14, topo - 24, 11, { bold: true }); texto(nota, x + 14, topo - 37, 6.8, { color: MUTED });
    const celW = (largura - 28 - 16) / 2;
    series.forEach((serie, i) => {
      const cx = x + 14 + (i % 2) * (celW + 16); const cy = topo - 52 - Math.floor(i / 2) * celH; // cy: topo da célula
      const ultimo = serie.pontos[serie.pontos.length - 1];
      texto(serie.rotulo, cx, cy, 8.5, { bold: true }); texto(`${ultimo.valor.toLocaleString('pt-BR')} em ${ultimo.rotulo}`, cx + celW, cy, 8.5, { bold: true, right: true });
      const valores = serie.pontos.map(p => p.valor); const lo = Math.min(0, ...valores); const hi = Math.max(0, ...valores); const faixa = hi - lo || 1;
      const altoGraf = 34; const zeroY = cy - 22 - (hi / faixa) * altoGraf; const passo = celW / serie.pontos.length; const bw = Math.min(30, passo - 14);
      page.drawLine({ start: { x: cx, y: zeroY }, end: { x: cx + celW, y: zeroY }, thickness: 0.6, color: GHOST });
      serie.pontos.forEach((p, k) => {
        const barH = Math.max(Math.abs(p.valor) / faixa * altoGraf, 1.2); const bx = cx + passo * k + (passo - bw) / 2; const atual = k === serie.pontos.length - 1;
        page.drawRectangle({ x: bx, y: p.valor >= 0 ? zeroY : zeroY - barH, width: bw, height: barH, color: p.valor < 0 ? RED : GOLD, opacity: atual ? 1 : 0.55 });
        texto(p.texto, bx + bw / 2 - normal.widthOfTextAtSize(seguro(p.texto), 6.5) / 2, p.valor >= 0 ? zeroY + barH + 3 : zeroY - barH - 8, 6.5, { bold: atual, color: atual ? TEXT : MUTED });
        texto(p.rotulo, bx + bw / 2 - normal.widthOfTextAtSize(seguro(p.rotulo), 6.5) / 2, cy - 22 - altoGraf - 24, 6.5, { color: MUTED });
      });
    });
    return h;
  };
  const h1 = d.series.length ? colunas('Emprego formal: saldo de vagas por mês', 'Novo CAGED. Dourado: saldo positivo; vermelho: negativo; última coluna: mês mais recente. Escala própria por gráfico.', d.series, M, W, y) : grafico('Saldo de emprego formal', 'Vagas no mês: atual (dourado) e anterior (cinza). Novo CAGED.', d.emprego, 'global', M, W, y);
  y -= h1 + 12;
  const h2 = grafico('Juros, preços e atividade', 'Em %: atual (dourado) e anterior (cinza). Escala própria por linha.', d.taxas, 'linha', M, W, y);
  y -= h2 + 12;

  // Derivados
  if (d.derivados.length) {
    const dw = (W - gap * (d.derivados.length - 1)) / d.derivados.length;
    d.derivados.forEach((x, i) => { const xx = M + i * (dw + gap); caixa(xx, y - 62, dw, 62); texto(x.rotulo, xx + 10, y - 18, 7, { bold: true, color: MUTED }); texto(x.valor, xx + 10, y - 40, 14, { bold: true }); texto(x.nota, xx + 10, y - 54, 6.5, { color: MUTED }); });
  }
  texto('Fontes: Banco Central, IBGE e Ministério do Trabalho (Novo CAGED), coletadas pela SINDI. Cada indicador traz valor atual e anterior; não há série histórica.', M, 34, 6.5, { color: MUTED });
  texto('Valores derivados são cálculos simples sobre esses dados. Documento informativo, sem valor jurídico.', M, 25, 6.5, { color: MUTED });
  return pdf.save();
}
