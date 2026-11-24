/**
 * Desenho do PDF do DANFSe (A4, uma página) com pdf-lib.
 *
 * Porte para TypeScript de `internal/renderer` (renderer.go, layout.go, text.go, labels.go, style.go) do
 * gerador oficial de DANFSe da Receita Federal do Brasil (repositório calculadora-rtc-gerador-danfse, em Go).
 *
 * MIT License - Copyright (c) Receita Federal do Brasil. Permission is hereby granted, free of charge, to any
 * person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the
 * Software without restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, subject to the inclusion of the original copyright
 * notice and this permission notice in all copies or substantial portions of the Software. THE SOFTWARE IS
 * PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. Esta é uma adaptação feita pela SINDI, não um produto oficial.
 *
 * Posições vêm em centímetros contados do topo da página (como no original); `topoParaY` converte para o eixo
 * do PDF (origem embaixo): y = 841,89 − cm × 72/2,54. A saída é determinística: sem data atual e com
 * metadados fixos, então o mesmo XML gera sempre os mesmos bytes.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { DocumentoDanfse, SecaoParte } from '@/lib/danfse/apresentacao';
import {
  ALTURA_PAG,
  ALTURA_PARTE_SUPRIMIDA,
  ALTURA_MUNICIPAL_SUPRIMIDO,
  ALTURA_SECAO,
  ALTURA_SECAO_COMPL,
  ALTURA_SECAO_TOTAL,
  CANHOTO_BAIXO,
  CHAVE,
  COL1_CM,
  CM_PT,
  DESLOC_CONTEUDO_COMPL,
  DESLOC_DESC_SERVICO,
  DESLOC_TRIB_SERVICO,
  FOLGA_COLUNA,
  GRADE,
  IBS_LINHA2,
  IBS_LINHA3,
  LARGURA_PAG,
  PAGINA,
  PASSO_FEDERAL,
  PASSO_IBS,
  PASSO_LINHA,
  PASSO_LINHA_COMPL,
  PASSO_MUNICIPAL,
  PASSO_PARTE,
  PASSO_TOTAIS,
  QR,
  RECUO_CAMPO,
  TAM_ROTULO,
  QR_TEXTO_ESQ,
  TAM_TITULO,
  TAM_VALOR,
  TITULO_SECAO,
  TOPO_CAMPOS_DPS,
  TOPO_CAMPOS_NFSE,
  Y_CANHOTO,
  calcularAlocacaoTexto,
  cm,
  colunaX,
  corpoDir,
  corpoEsq,
  larguraColunas,
  montarLayoutPagina,
  topoParaY,
  type LayoutPagina,
} from '@/lib/danfse/geometria';
import {
  ASCENDER,
  AJUSTE_BASE,
  CINZA_CABECALHO,
  ESTILO_ACESSO,
  ESTILO_CAMPO,
  ESTILO_CAMPO_SOMBREADO,
  ESTILO_ID,
  ESTILO_ID_SOMBREADO,
  MAX_CARACTERES,
  PRETO,
  RETICENCIAS,
  VERMELHO,
  type Estilo,
} from '@/lib/danfse/estilo';
import { R } from '@/lib/danfse/rotulos';
import { LOGO_NFSE_BASE64 } from '@/lib/danfse/logo-nfse';

// ------------------------------------------------------------------------------------------------ texto (text.go)

const aparar = (s: string) => s.replace(/^\s+|\s+$/g, '');
const ultimoEspaco = (s: string) => Math.max(s.lastIndexOf(' '), s.lastIndexOf('\n'));

class Desenho {
  private readonly larguras = new Map<PDFFont, Map<string, number>>();
  constructor(
    private readonly page: PDFPage,
    private readonly regular: PDFFont,
    private readonly negrito: PDFFont,
    private readonly logo: PDFImage,
  ) {}

  /** Largura em pontos, somando a de cada caractere (sem kerning, como o PDF é escrito). */
  largura(texto: string, tamanho: number, fonte: PDFFont): number {
    let cache = this.larguras.get(fonte);
    if (!cache) {
      cache = new Map();
      this.larguras.set(fonte, cache);
    }
    let soma = 0;
    for (const c of texto) {
      let w = cache.get(c);
      if (w === undefined) {
        w = fonte.widthOfTextAtSize(c, 1);
        cache.set(c, w);
      }
      soma += w;
    }
    return soma * tamanho;
  }

  /** Maior prefixo (em unidades de texto) que cabe em `largura` pontos. */
  private prefixoQueCabe(texto: string, tamanho: number, largura: number, fonte = this.regular): number {
    let soma = 0;
    let fim = 0;
    for (const c of texto) {
      soma += this.largura(c, tamanho, fonte);
      if (soma > largura + 1e-9) break;
      fim += c.length;
    }
    return fim;
  }

  /** Próxima linha de um texto que quebra em espaço; devolve a linha e quanto do texto ela consumiu. */
  proximaLinha(texto: string, tamanho: number, largura: number): [string, number] {
    const cabe = this.prefixoQueCabe(texto, tamanho, largura);
    if (cabe <= 0) return ['', 0];
    let parte = aparar(texto.slice(0, cabe));
    let consumido = cabe;
    if (cabe < texto.length) {
      const n = ultimoEspaco(parte);
      if (n > 0) {
        parte = aparar(parte.slice(0, n));
        consumido = texto.slice(0, n).replace(/[ \n]+$/, '').length;
      }
    }
    return [parte, consumido];
  }

  medirLinhas(texto: string, largura: number, tamanho: number): number {
    let linhas = 0;
    let resto = aparar(texto);
    while (resto !== '') {
      const [parte] = this.proximaLinha(resto, tamanho, largura);
      if (parte === '') break;
      resto = aparar(resto.slice(parte.length));
      linhas++;
    }
    return linhas;
  }

  truncarLinhas(texto: string, largura: number, tamanho: number, maxLinhas: number): string {
    let resto = aparar(texto);
    const linhas: string[] = [];
    while (linhas.length < maxLinhas && resto !== '') {
      const [parte] = this.proximaLinha(resto, tamanho, largura);
      if (parte === '') break;
      linhas.push(parte);
      resto = aparar(resto.slice(parte.length));
    }
    let resultado = linhas.join('\n');
    if (resto !== '') resultado = resultado.replace(/[ \n]+$/, '') + RETICENCIAS;
    return resultado;
  }

  /** Corta com "..." no maior prefixo que cabe; se nem as reticências cabem junto de dados, devolve vazio. */
  truncar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
    if (texto === '') return texto;
    if (this.largura(texto, tamanho, fonte) <= largura) return texto;
    const pontos = Array.from(texto);
    let lo = 0;
    let hi = pontos.length - 1;
    let melhor = '';
    while (lo <= hi) {
      const meio = Math.floor((lo + hi) / 2);
      const candidato = pontos.slice(0, meio).join('').replace(/ +$/, '') + RETICENCIAS;
      if (this.largura(candidato, tamanho, fonte) <= largura) {
        melhor = candidato;
        lo = meio + 1;
      } else hi = meio - 1;
    }
    return melhor === RETICENCIAS ? '' : melhor;
  }

  ajustar(valor: string, fonte: PDFFont, tamanho: number, largura: number) {
    return this.largura(valor, tamanho, fonte) <= largura ? valor : this.truncar(valor, fonte, tamanho, largura);
  }

  /** Mantém o sufixo da linha de totais de tributos e encurta só o começo (busca binária em caracteres). */
  ajustarComplementares(
    texto: string,
    linhaTributos: string,
    largura: number,
    tamanho: number,
    maxLinhas: number,
  ): string {
    if (this.medirLinhas(texto, largura, tamanho) <= maxLinhas) return texto;
    if (linhaTributos !== '' && texto.endsWith(linhaTributos)) {
      const prefixo = Array.from(texto.slice(0, texto.length - linhaTributos.length));
      const sufixo = ` | ${linhaTributos}`;
      let lo = 0;
      let hi = prefixo.length - 1;
      let melhor = '';
      while (lo <= hi) {
        const meio = Math.floor((lo + hi) / 2);
        const candidato = prefixo.slice(0, meio).join('').replace(/ +$/, '') + RETICENCIAS + sufixo;
        if (this.medirLinhas(candidato, largura, tamanho) <= maxLinhas) {
          melhor = candidato;
          lo = meio + 1;
        } else hi = meio - 1;
      }
      return melhor !== '' ? melhor : linhaTributos;
    }
    return this.truncarLinhas(texto, largura, tamanho, maxLinhas);
  }

  // -------------------------------------------------------------------------------------------- primitivas de desenho

  linha(x1: number, y1: number, x2: number, y2: number, espessura: number) {
    this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: espessura, color: PRETO });
  }
  linhaH(topoCm: number, espessura = 0.5) {
    this.linha(corpoEsq(), topoParaY(topoCm), corpoDir(), topoParaY(topoCm), espessura);
  }
  linhaV(xCm: number, topoCm: number, baixoCm: number, espessura = 0.5) {
    this.linha(xCm * CM_PT, topoParaY(topoCm), xCm * CM_PT, topoParaY(baixoCm), espessura);
  }
  retanguloPreenchido(x: number, y: number, largura: number, altura: number) {
    this.page.drawRectangle({ x, y, width: largura, height: altura, color: CINZA_CABECALHO });
  }

  texto(valor: string, x: number, y: number, tamanho: number, fonte: PDFFont, cor = PRETO) {
    if (valor.trim() === '') return;
    this.page.drawText(valor, { x, y, size: tamanho, font: fonte, color: cor });
  }
  linhaBase(topoCm: number, tamanho: number) {
    return topoParaY(topoCm) - ASCENDER * tamanho - tamanho * AJUSTE_BASE;
  }
  textoTopo(valor: string, x: number, topoCm: number, tamanho: number, fonte: PDFFont, cor = PRETO) {
    this.texto(valor, x, this.linhaBase(topoCm, tamanho), tamanho, fonte, cor);
  }
  centralizar(valor: string, x: number, topoCm: number, largura: number, tamanho: number, fonte: PDFFont, cor = PRETO) {
    const w = this.largura(valor, tamanho, fonte);
    this.texto(valor, x + (largura - w) / 2, this.linhaBase(topoCm, tamanho), tamanho, fonte, cor);
  }
  quebrar(
    valor: string,
    x: number,
    topoCm: number,
    largura: number,
    tamanho: number,
    fonte: PDFFont,
    maxLinhas: number,
  ) {
    if (maxLinhas <= 0) return;
    const alturaLinha = tamanho * 1.2;
    let resto = aparar(valor);
    for (let linha = 0; linha < maxLinhas && resto !== ''; linha++) {
      const [parteBruta, consumido] = this.proximaLinha(resto, tamanho, largura);
      let parte = parteBruta;
      if (parte === '' || consumido === 0) break;
      if (linha === maxLinhas - 1 && consumido < resto.length)
        parte = this.truncar(parte + RETICENCIAS, fonte, tamanho, largura);
      this.textoTopo(parte, x, topoCm + (alturaLinha * linha) / CM_PT, tamanho, fonte);
      resto = aparar(resto.slice(consumido));
    }
  }

  celula(x: number, topoCm: number, larguraCm: number, rotulo: string, valor: string, estilo: Estilo) {
    const recuo = cm(estilo.recuo);
    const largura = larguraCm * CM_PT - 2 * recuo;
    if (estilo.sombra)
      this.retanguloPreenchido(
        x,
        topoParaY(topoCm + estilo.sombra.topo + estilo.sombra.altura),
        larguraCm * CM_PT,
        estilo.sombra.altura * CM_PT,
      );
    if (rotulo !== '')
      this.textoTopo(
        this.ajustar(rotulo, this.negrito, estilo.rotulo, largura),
        x + recuo,
        topoCm + estilo.deslocRotulo,
        estilo.rotulo,
        this.negrito,
      );
    this.textoTopo(
      this.ajustar(valor.trim() === '' ? '-' : valor, this.regular, estilo.valor, largura),
      x + recuo,
      topoCm + estilo.deslocValor,
      estilo.valor,
      this.regular,
    );
  }
  campo(coluna: number, topoCm: number, colunas: number, rotulo: string, valor: string, sombreado = false) {
    this.celula(
      colunaX(coluna),
      topoCm,
      larguraColunas(coluna, colunas) / CM_PT,
      rotulo,
      valor,
      sombreado ? ESTILO_CAMPO_SOMBREADO : ESTILO_CAMPO,
    );
  }
  campoIdentificacao(x: number, topoCm: number, larguraCm: number, rotulo: string, valor: string, sombreado: boolean) {
    this.celula(x, topoCm, larguraCm, rotulo, valor, sombreado ? ESTILO_ID_SOMBREADO : ESTILO_ID);
  }
  multiplasLinhas(
    x: number,
    topoCm: number,
    largura: number,
    altura: number,
    rotulo: string,
    valor: string,
    tamanho: number,
  ) {
    const recuo = cm(RECUO_CAMPO);
    if (rotulo !== '') this.textoTopo(rotulo, x + recuo, topoCm, TAM_ROTULO, this.negrito);
    this.quebrar(
      valor,
      x + recuo,
      topoCm + 0.3,
      largura - 2 * recuo,
      tamanho,
      this.regular,
      Math.max(1, Math.floor(altura / (tamanho * 1.2) + 1e-9)),
    );
  }

  tituloSecao(topoCm: number, titulo: string, alturaCm: number, sombreado: boolean) {
    const y = topoParaY(topoCm);
    const h = alturaCm * CM_PT;
    if (sombreado) this.retanguloPreenchido(corpoEsq(), y - h, COL1_CM * CM_PT, h);
    this.textoTopo(titulo, corpoEsq() + cm(RECUO_CAMPO), topoCm + TITULO_SECAO, TAM_TITULO, this.negrito);
    this.linha(corpoEsq(), y, corpoDir(), y, 0.5);
  }
  secao(topoCm: number, titulo: string, alturaCm = ALTURA_SECAO) {
    this.tituloSecao(topoCm, titulo, alturaCm, true);
  }

  blocoSuprimido(topoCm: number, valor: string, alturaCm: number) {
    this.linha(corpoEsq(), topoParaY(topoCm), corpoDir(), topoParaY(topoCm), 0.5);
    this.linha(corpoEsq(), topoParaY(topoCm + alturaCm), corpoDir(), topoParaY(topoCm + alturaCm), 0.5);
    const tamanho = 7.5;
    const largura = corpoDir() - corpoEsq() - 2;
    const texto = this.ajustar(valor, this.regular, tamanho, largura);
    this.centralizar(texto, corpoEsq() + 1, topoCm + (alturaCm - tamanho / CM_PT) / 2, largura, tamanho, this.regular);
  }

  // -------------------------------------------------------------------------------------------- blocos do documento

  cabecalho(doc: DocumentoDanfse) {
    const c = doc.cabecalho;
    this.retanguloPreenchido(corpoEsq(), topoParaY(0.3 + 1.16), cm(20.4), cm(1.16));
    this.page.drawImage(this.logo, { x: cm(0.49), y: topoParaY(0.44 + 0.85), width: cm(4), height: cm(0.85) });
    this.centralizar(R.versao, GRADE.x2 * CM_PT, 0.35, cm(10.19), TAM_TITULO + 2, this.negrito);
    this.centralizar(R.documentoAuxiliar, GRADE.x2 * CM_PT, 0.65, cm(10.19), TAM_TITULO + 2, this.negrito);
    if (c.tipoAmbiente === 'Homologação')
      this.centralizar(R.semValidade, GRADE.x2 * CM_PT, 0.95, cm(10.19), 9, this.negrito, VERMELHO);
    const x4 = GRADE.x4 * CM_PT;
    const sobra = corpoDir() - x4 - cm(RECUO_CAMPO);
    this.textoTopo(
      this.ajustar(`Município: ${c.municipio} - ${c.uf}`, this.regular, 8, sobra),
      x4,
      0.45,
      8,
      this.regular,
    );
    this.textoTopo(
      this.ajustar(`Ambiente Gerador: ${c.ambienteGerador}`, this.regular, 6, sobra),
      x4,
      0.97,
      6,
      this.regular,
    );
    this.textoTopo(
      this.ajustar(`Tipo de Ambiente: ${c.tipoAmbiente}`, this.regular, 6, sobra),
      x4,
      1.22,
      6,
      this.regular,
    );
    this.linha(corpoEsq(), topoParaY(1.48), corpoDir(), topoParaY(1.48), 0.5);
  }

  infoNfse(doc: DocumentoDanfse) {
    const a = doc.acesso;
    this.celula(corpoEsq(), CHAVE.topo, CHAVE.largura, R.chave, a.chaveAcesso, ESTILO_ACESSO);
    this.qrCode(a.codigoQR);
    R.qr.forEach((linha, i) =>
      this.textoTopo(linha, cm(QR_TEXTO_ESQ), QR.textoTopo + i * QR.textoPasso, 6, this.regular),
    );
    const col = (i: number) => larguraColunas(i, 1) / CM_PT;
    this.celula(colunaX(0), TOPO_CAMPOS_NFSE, col(0), R.numeroNfse, a.numeroNFSe, ESTILO_ACESSO);
    this.celula(colunaX(1), TOPO_CAMPOS_NFSE, col(1), R.competencia, a.competencia, ESTILO_ACESSO);
    this.celula(colunaX(2), TOPO_CAMPOS_NFSE, col(2), R.emissaoNfse, a.dataHoraEmissaoNFSe, ESTILO_ACESSO);
    this.celula(colunaX(0), TOPO_CAMPOS_DPS, col(0), R.numeroDps, a.numeroDPS, ESTILO_ACESSO);
    this.celula(colunaX(1), TOPO_CAMPOS_DPS, col(1), R.serieDps, a.serieDPS, ESTILO_ACESSO);
    this.celula(colunaX(2), TOPO_CAMPOS_DPS, col(2), R.emissaoDps, a.dataHoraEmissaoDPS, ESTILO_ACESSO);
  }

  /** O QR é desenhado módulo a módulo (retângulos pretos), juntando os módulos escuros vizinhos da mesma linha. */
  qrCode(texto: string) {
    let qr;
    try {
      qr = QRCode.create(texto, { errorCorrectionLevel: 'M' });
    } catch {
      return;
    }
    const n = qr.modules.size;
    const lado = cm(QR.lado);
    const modulo = lado / n;
    const x0 = cm(QR.esquerda);
    const yBase = topoParaY(QR.topo + QR.lado);
    for (let linha = 0; linha < n; linha++) {
      let coluna = 0;
      while (coluna < n) {
        if (!qr.modules.get(linha, coluna)) {
          coluna++;
          continue;
        }
        let fim = coluna;
        while (fim < n && qr.modules.get(linha, fim)) fim++;
        this.page.drawRectangle({
          x: x0 + coluna * modulo,
          y: yBase + lado - (linha + 1) * modulo,
          width: (fim - coluna) * modulo,
          height: modulo,
          color: PRETO,
        });
        coluna = fim;
      }
    }
  }

  secaoParte(
    topoCm: number,
    titulo: string,
    p: SecaoParte,
    variante: 'prestador' | 'tomador' | 'destinatario' | 'intermediario',
  ) {
    this.secao(topoCm, titulo);
    this.campo(1, topoCm, variante === 'destinatario' ? 2 : 1, R.cnpj, p.cnpjCpfNif);
    if (variante !== 'destinatario') this.campo(2, topoCm, 1, R.im, p.inscricaoMunicipal);
    this.campo(3, topoCm, 1, R.telefone, p.telefone);
    this.campo(0, topoCm + PASSO_PARTE, 2, R.nome, p.nome);
    this.campo(2, topoCm + PASSO_PARTE, 1, R.municipioUf, p.municipioUF);
    this.campo(3, topoCm + PASSO_PARTE, 1, R.ibgeCep, p.codigoIbgeCep);
    this.campo(0, topoCm + 2 * PASSO_PARTE, 2, R.endereco, p.endereco);
    this.campo(2, topoCm + 2 * PASSO_PARTE, 2, R.email, p.email);
    if (variante === 'prestador') {
      this.campo(0, topoCm + 3 * PASSO_PARTE, 2, R.simples, p.simplesNacional);
      this.campo(2, topoCm + 3 * PASSO_PARTE, 2, R.regimeSn, p.regimeApuracaoSN);
    }
  }

  partes(doc: DocumentoDanfse, layout: LayoutPagina) {
    this.campoIdentificacao(corpoEsq(), 3.65, COL1_CM, R.emitente, doc.acesso.tipoEmitente, true);
    this.campoIdentificacao(colunaX(1), 3.65, larguraColunas(1, 1) / CM_PT, R.situacao, doc.acesso.situacao, false);
    this.campoIdentificacao(colunaX(2), 3.65, larguraColunas(2, 1) / CM_PT, R.finalidade, doc.acesso.finalidade, false);
    this.secaoParte(4.34, R.prestador, doc.partes.emitente, 'prestador');
    const opcional = (
      topo: number,
      titulo: string,
      p: SecaoParte,
      variante: 'tomador' | 'destinatario' | 'intermediario',
    ) =>
      p.visivel
        ? this.secaoParte(topo, titulo, p, variante)
        : this.blocoSuprimido(topo, p.mensagemSupressao, ALTURA_PARTE_SUPRIMIDA);
    opcional(layout.tomador, R.tomador, doc.partes.tomador, 'tomador');
    opcional(layout.destinatario, R.destinatario, doc.partes.destinatario, 'destinatario');
    opcional(layout.intermediario, R.intermediario, doc.partes.intermediario, 'intermediario');
  }

  servico(doc: DocumentoDanfse, linhasDescricao: number, layout: LayoutPagina) {
    const y = layout.servico;
    const s = doc.servico;
    const descricao = s.descServ === '' ? s.descServOriginal : s.descServ;
    this.secao(y, R.servico);
    this.campo(1, y, 1, R.codTrib, s.codigoTribNacMun);
    this.campo(2, y, 1, R.nbs, s.codigoNBS);
    this.campo(3, y, 1, R.localPrestacao, s.localPrestacaoUF);
    this.textoTopo(
      this.truncar(s.xTribNac, this.regular, TAM_VALOR, corpoDir() - corpoEsq() - cm(FOLGA_COLUNA)),
      corpoEsq() + cm(RECUO_CAMPO),
      y + DESLOC_TRIB_SERVICO,
      TAM_VALOR,
      this.regular,
    );
    this.multiplasLinhas(
      corpoEsq(),
      y + DESLOC_DESC_SERVICO,
      corpoDir() - corpoEsq(),
      linhasDescricao * PASSO_LINHA * CM_PT,
      R.descricao,
      descricao,
      TAM_VALOR,
    );
  }

  tributacaoMunicipal(doc: DocumentoDanfse, layout: LayoutPagina, d: number) {
    const m = doc.municipal;
    const t = layout.municipal + d;
    if (!m.visivel) {
      this.blocoSuprimido(t, m.mensagemSupressao, ALTURA_MUNICIPAL_SUPRIMIDO);
      return;
    }
    this.secao(t, R.tribMunicipal);
    this.campo(1, t, 1, R.tipoTrib, m.tribISSQN);
    this.campo(2, t, 2, R.municipioIncid, m.municipioUFPaisIncid);
    const l1 = t + PASSO_MUNICIPAL;
    this.campo(0, l1, 1, R.regEsp, m.regEspTrib);
    this.campo(1, l1, 1, R.imunidade, m.tpImunidade);
    this.campo(2, l1, 1, R.suspensao, m.suspensaoExig);
    this.campo(3, l1, 1, R.processo, m.nProcessoSusp);
    const l2 = t + 2 * PASSO_MUNICIPAL;
    this.campo(0, l2, 1, R.beneficio, m.beneficioMunicipal);
    this.campo(1, l2, 1, R.calculoBM, m.calculoBM);
    this.campo(2, l2, 1, R.deducoes, m.totalDeducoes);
    this.campo(3, l2, 1, R.descIncond, m.descontoIncond);
    const l3 = t + 3 * PASSO_MUNICIPAL;
    this.campo(0, l3, 1, R.bcIssqn, m.bcISSQN);
    this.campo(1, l3, 1, R.aliqAplicada, m.aliqAplic);
    this.campo(2, l3, 1, R.retencaoIssqn, m.retISSQN);
    this.campo(3, l3, 1, R.issqnApurado, m.issqnApurado);
  }

  tributacaoFederal(doc: DocumentoDanfse, layout: LayoutPagina, d: number) {
    const f = doc.federal;
    const t = layout.federal + d;
    this.secao(t, R.tribFederal);
    this.campo(1, t, 1, R.irrf, f.irrf);
    this.campo(2, t, 1, R.contribPrevid, f.contribPrevidRet);
    this.campo(3, t, 1, R.contribSoc, f.contribSocRet);
    if (f.exibirPisCofins) {
      this.campo(0, t + PASSO_FEDERAL, 1, R.pis, f.pisDebito);
      this.campo(1, t + PASSO_FEDERAL, 1, R.cofins, f.cofinsDebito);
      this.campo(2, t + PASSO_FEDERAL, 2, R.descContrib, f.descContribRet);
    }
  }

  tributacaoIbsCbs(doc: DocumentoDanfse, layout: LayoutPagina, d: number) {
    const i = doc.ibscbs;
    const t = layout.ibs + d;
    this.secao(t, R.tribIbsCbs);
    this.campo(1, t, 1, R.cst, i.cstClassTrib);
    this.campo(2, t, 2, R.indOp, i.indOpLocalidadeUF);
    const l1 = t + PASSO_IBS;
    this.campo(0, l1, 1, R.exclusoes, i.exclusoesReducoesBC);
    this.campo(1, l1, 1, R.bcPos, i.bcPosExclusoes);
    this.campo(2, l1, 1, R.redAliq, i.redAliqIBSCBS);
    this.campo(3, l1, 1, R.aliqUfMun, i.aliqIBSUFMun);
    const l2 = t + IBS_LINHA2;
    this.campo(0, l2, 1, R.aliqEfetMun, i.aliqEfetMunIBS);
    this.campo(1, l2, 1, R.valorMun, i.valorMunIBS);
    this.campo(2, l2, 1, R.aliqEfetEst, i.aliqEfetEstIBS);
    this.campo(3, l2, 1, R.valorEst, i.valorEstIBS);
    const l3 = t + IBS_LINHA3;
    this.campo(0, l3, 1, R.valorTotalIbs, i.valorTotalIBS);
    this.campo(1, l3, 1, R.aliqCbs, i.aliqCBS);
    this.campo(2, l3, 1, R.aliqEfetCbs, i.aliqEfetCBS);
    this.campo(3, l3, 1, R.valorTotalCbs, i.valorTotalCBS);
  }

  totais(doc: DocumentoDanfse, layout: LayoutPagina, d: number) {
    const t = layout.totais + d;
    const v = doc.totais;
    this.secao(t, R.valorTotalNfse, ALTURA_SECAO_TOTAL);
    this.campo(1, t, 1, R.valorOperacao, v.valorOperacao);
    this.campo(2, t, 1, R.descIncond, v.descontoIncond);
    this.campo(3, t, 1, R.descCond, v.descontoCond);
    const l1 = t + PASSO_TOTAIS;
    this.campo(0, l1, 1, R.totalRetencoes, v.totalRetencoes);
    this.campo(1, l1, 1, R.valorLiquido, v.valorLiquido);
    this.campo(2, l1, 1, R.totalIbsCbs, v.totalIBSCBS);
    this.campo(3, l1, 1, R.valorLiquidoIbsCbs, v.valorLiquidoIBSCBS, true);
  }

  conteudoComplementar(doc: DocumentoDanfse): string {
    const c = doc.complementares;
    const origem = c.conteudo === '' ? c.conteudoOriginal : c.conteudo;
    if (origem === '') return c.linhaTributos;
    if (c.linhaTributos !== '' && origem.includes(c.linhaTributos)) return origem;
    return c.linhaTributos !== '' ? `${origem} | ${c.linhaTributos}` : origem;
  }

  informacoesComplementares(doc: DocumentoDanfse, layout: LayoutPagina, d: number, linhas: number) {
    this.tituloSecao(layout.complementar + d, R.complementares, ALTURA_SECAO_COMPL, false);
    const topo = layout.complementar + DESLOC_CONTEUDO_COMPL + d;
    const largura = corpoDir() - corpoEsq() - 3;
    const conteudo = this.ajustarComplementares(
      this.conteudoComplementar(doc),
      doc.complementares.linhaTributos,
      largura,
      6.5,
      linhas,
    );
    this.multiplasLinhas(
      corpoEsq(),
      topo,
      corpoDir() - corpoEsq(),
      linhas * PASSO_LINHA_COMPL * CM_PT,
      '',
      conteudo,
      6.5,
    );
  }

  canhoto(doc: DocumentoDanfse) {
    if (!doc.canhoto) return;
    this.linhaH(Y_CANHOTO);
    this.linhaH(CANHOTO_BAIXO);
    for (const x of [0.3, GRADE.x2, GRADE.x3, 20.7]) this.linhaV(x, Y_CANHOTO, CANHOTO_BAIXO);
    this.textoTopo(R.dataCiencia, corpoEsq() + 2, 28.17, 6, this.negrito);
    this.textoTopo(R.identificacao, GRADE.x2 * CM_PT + 2, 28.17, 6, this.negrito);
    this.textoTopo(R.numeroChave, GRADE.x3 * CM_PT + 2, 28.17, 6, this.negrito);
    this.quebrar(
      `${doc.acesso.numeroNFSe} / ${doc.acesso.chaveAcesso}`,
      GRADE.x3 * CM_PT + 2,
      28.47,
      corpoDir() - GRADE.x3 * CM_PT,
      6.5,
      this.regular,
      2,
    );
  }

  moldura() {
    this.page.drawRectangle({
      x: PAGINA.esquerda * CM_PT,
      y: ALTURA_PAG - PAGINA.baixo * CM_PT,
      width: (PAGINA.direita - PAGINA.esquerda) * CM_PT,
      height: (PAGINA.baixo - PAGINA.topo) * CM_PT,
      borderWidth: 1,
      borderColor: PRETO,
    });
  }

  /** Marca d'água diagonal centralizada na página (SUBSTITUÍDA / CANCELADA). */
  marcaDagua(m: DocumentoDanfse['marcaDagua']) {
    if (m.texto === '') return;
    const w = this.largura(m.texto, m.tamanhoFonte, this.negrito);
    const angulo = (m.angulo * Math.PI) / 180;
    const cos = Math.cos(angulo);
    const sin = Math.sin(angulo);
    const meioAltura = (m.tamanhoFonte * ASCENDER) / 2;
    // A origem do texto é o canto inferior esquerdo: recua metade da largura e da altura na direção girada.
    const x = ALTURA_PAG * 0 + LARGURA_PAG / 2 - ((w / 2) * cos - meioAltura * sin);
    const y = ALTURA_PAG / 2 - ((w / 2) * sin + meioAltura * cos);
    this.page.drawText(m.texto, {
      x,
      y,
      size: m.tamanhoFonte,
      font: this.negrito,
      color: rgb(m.cor, m.cor, m.cor),
      opacity: m.opacidade,
      rotate: degrees(m.angulo),
    });
  }
}

// ------------------------------------------------------------------------------------------------ entrada

/** Deixa só o que a Helvetica (WinAnsi) consegue escrever e limita o tamanho: um caractere fora do conjunto viraria erro. */
function sanear<T>(valor: T, permitidos: Set<number>): T {
  if (typeof valor === 'string') {
    let saida = '';
    let n = 0;
    for (const c of valor) {
      if (++n > MAX_CARACTERES) break;
      const codigo = c.codePointAt(0)!;
      saida += codigo < 0x20 || codigo === 0x7f ? ' ' : permitidos.has(codigo) ? c : '?';
    }
    return saida as T;
  }
  if (Array.isArray(valor)) return valor.map((item) => sanear(item, permitidos)) as T;
  if (valor && typeof valor === 'object')
    return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, sanear(item, permitidos)])) as T;
  return valor;
}

/** Gera o PDF (uma página A4) de um documento já apresentado. Determinístico. */
export async function desenharDanfse(documento: DocumentoDanfse): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle('DANFSe - Documento Auxiliar da NFS-e');
  pdf.setProducer('SINDI (adaptação do gerador oficial de DANFSe da Receita Federal, MIT)');
  pdf.setCreator('SINDI');
  const fixa = new Date(Date.UTC(2000, 0, 1));
  pdf.setCreationDate(fixa);
  pdf.setModificationDate(fixa);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(LOGO_NFSE_BASE64, 'base64'));
  const doc = sanear(documento, new Set(regular.getCharacterSet()));
  const pagina = pdf.addPage([LARGURA_PAG, ALTURA_PAG]);
  const d = new Desenho(pagina, regular, negrito, logo);

  const layout = montarLayoutPagina(doc);
  const descricao = doc.servico.descServ === '' ? doc.servico.descServOriginal : doc.servico.descServ;
  const largura = corpoDir() - corpoEsq() - 3;
  const alocacao = calcularAlocacaoTexto(
    layout,
    doc.canhoto,
    d.medirLinhas(descricao, largura, TAM_VALOR),
    d.medirLinhas(d.conteudoComplementar(doc), largura, 6.5),
  );

  d.cabecalho(doc);
  d.infoNfse(doc);
  d.partes(doc, layout);
  d.servico(doc, alocacao.linhasDescricao, layout);
  d.tributacaoMunicipal(doc, layout, alocacao.deslocamento);
  d.tributacaoFederal(doc, layout, alocacao.deslocamento);
  d.tributacaoIbsCbs(doc, layout, alocacao.deslocamento);
  d.totais(doc, layout, alocacao.deslocamento);
  d.informacoesComplementares(doc, layout, alocacao.deslocamento, alocacao.linhasComplementares);
  d.canhoto(doc);
  d.moldura();
  d.marcaDagua(doc.marcaDagua);
  return pdf.save({ useObjectStreams: false });
}
