import { vencido, lerEstado, gravarEstado, gravarDocumento, type BancoDeDados } from '@/lib/dados/db';
import { buscarComEducacao } from '@/lib/dados/http';
import { linksDe } from '@/lib/dados/html';
import { pdfParaTexto } from '@/lib/dados/legal';
import { NRS, pdfDaNR, urlDoPortalDoTrabalho, type NRColetada } from '@/lib/dados/nrs-lista';
import type { Coletor } from '@/lib/dados/coletores/tipos';

const UM_DIA_MS = 24 * 60 * 60 * 1000;
/** A maior NR vigente (NR-12) tem um PDF de ~1 MB; acima disso o arquivo não é o que se espera. */
const MAXIMO_DE_BYTES_DO_PDF = 25 * 1024 * 1024;
/** A página de uma NR no portal tem ~200 KB de HTML. */
const MAXIMO_DE_BYTES_DA_PAGINA = 3 * 1024 * 1024;
/** Tamanho de um documento: o trecho que o modelo recebe sai dele, e item de NR é curto. Acima disso a seção é partida nos itens. */
const ALVO_DO_DOCUMENTO = 7_000;
const TETO_DO_DOCUMENTO = 12_000;

export type SecaoDaNR = { key: string; label: string; content: string };

const RUIDO_DO_PDF = /^(?:Este texto não substitui o publicado no DOU\s*\d*|-- \d+ of \d+ --)$/i;
/** Item numerado ("6.5.1 ..."), alínea ("a) ..."), inciso romano, marcador, anexo e as notas de redação: cada um abre um parágrafo; o resto é continuação da linha anterior. */
const ABRE_PARAGRAFO =
  /^(?:\d{1,2}(?:\.\d{1,3})+\.?\s|[a-z]\)\s|[IVXL]+\s*[-–—]\s|[•●▪-]\s|Anexo\b|ANEXO\b|Quadro\b|Tabela\b|Figura\b|\((?:Redação|Inclu|Revog|Alterad|Vide|Título)|Redação dada|Vide\b|Nota\b)/;
/** Item só com a marca de revogado: o texto riscado do PDF não se distingue do vigente, mas a norma troca o item por "(Revogado pela Portaria...)". */
const REVOGADO = /^(?:\d{1,2}(?:\.\d{1,3})*\.?\s*)?\(?\s*Revogad[oa]s?\b[^\n]{0,200}$/i;
const NUMERO_DO_ANEXO = String.raw`(?:N[º°o.]*\s*)?(?:[IVXLC]+|\d+(?:-[A-Z])?|[“"][A-Z][”"]|ÚNICO)`;
// "ANEXO I", "Anexo II - Título" e "ANEXO I da NR-35" abrem um anexo; "Anexo I da NR-12 estabelece..." no meio de uma frase não (o texto depois do número é curto ou título).
const ANEXO = new RegExp(
  String.raw`^(?:ANEXO\s+${NUMERO_DO_ANEXO}\b|Anexo\s+${NUMERO_DO_ANEXO}\s*(?:[-–—:]|$)|Anexo\s+${NUMERO_DO_ANEXO}\s+da\s+NR[-\s]?0?\d+\s*(?:[-–—].*)?$)`,
);

/** O cabeçalho do PDF diz de que NR é ("NR 06 - ...", "NR-09 - ...", "NORMA REGULAMENTADORA N.º 03 – ..."): confere que o arquivo é da norma certa. */
export function cabecalhoDaNR(linhas: string[], numero: number) {
  const padrao = new RegExp(`^(?:NR|NORMA REGULAMENTADORA(?:\\s+N)?)[\\s.\\-º°o]*0*${numero}\\b(?!\\.\\d)`, 'i');
  return linhas.slice(0, 40).some((l) => padrao.test(l.trim()));
}

/**
 * Divide o texto de uma NR em documentos: um por seção de segundo nível ("1.5 Gerenciamento de riscos ocupacionais"); seção grande é partida nos itens
 * de terceiro nível; cada anexo é um documento (ou vários, se grande). O cabeçalho (tabela de portarias e sumário) fica de fora. Falha de formato
 * (cabeçalho de outra norma, nenhum item) vira erro, nunca um documento vazio.
 */
export function dividirNR(texto: string, numero: number): SecaoDaNR[] {
  const brutas = texto
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l && !RUIDO_DO_PDF.test(l));
  if (!cabecalhoDaNR(brutas, numero)) throw new Error(`Extração suspeita (NR-${numero}): cabeçalho de outra norma`);

  // O sumário repete "N.1 Objetivo": o corpo começa na segunda ocorrência quando há sumário.
  const abre1 = new RegExp(`^${numero}\\.1\\.?\\s+\\S`);
  // Só vale o "Sumário" do cabeçalho: a palavra aparece também no corpo (anexos), onde não separa nada.
  const sumario = brutas.slice(0, 80).findIndex((l) => /^sum[áa]rio\b/i.test(l));
  const primeiros = brutas.flatMap((l, i) => (i > Math.max(sumario, -1) && abre1.test(l) ? [i] : []));
  const inicio = sumario >= 0 && primeiros.length > 1 ? primeiros[1] : primeiros[0];
  if (inicio === undefined) throw new Error(`Extração suspeita (NR-${numero}): início do texto não encontrado`);

  // Linhas viram parágrafos (a quebra do PDF no meio da frase é desfeita) e os itens revogados saem.
  // Quem abre um anexo é decidido pela primeira linha do parágrafo: a frase "Anexo I da NR-12 estabelece..." no meio do texto não conta.
  const paragrafos: { texto: string; anexo: boolean; primeira: string }[] = [];
  for (const linha of brutas.slice(inicio)) {
    if (!paragrafos.length || ABRE_PARAGRAFO.test(linha))
      paragrafos.push({ texto: linha, anexo: ANEXO.test(linha), primeira: linha });
    else paragrafos[paragrafos.length - 1].texto += ` ${linha}`;
  }
  const vigentes = paragrafos.filter((p) => !REVOGADO.test(p.texto));

  const item = new RegExp(`^(${numero}(?:\\.\\d{1,3})+)\\.?\\s+(\\S.*)$`);
  type Bloco = { codigo: string; nivel: number; paragrafos: string[] };
  // Seções de segundo nível (numeração crescente) e anexos; o que vem antes do primeiro item não existe porque o corpo começa em "N.1".
  const secoes: { chave: string; rotulo: string; blocos: Bloco[] }[] = [];
  let anexo = false;
  let anterior = 0;
  for (const { texto: p, anexo: abreAnexo, primeira } of vigentes) {
    if (abreAnexo) {
      anexo = true;
      const romano =
        p
          .match(/^Anexo\s+(?:N[º°o.]*\s*)?([IVXLC]+|\d+(?:-[A-Z])?|[“"][A-Z][”"]|único)/i)?.[1]
          ?.replace(/[“”"]/g, '')
          .toLowerCase() ?? String(secoes.length);
      secoes.push({ chave: `anexo-${romano}`, rotulo: primeira.slice(0, 120), blocos: [] });
    }
    const m = anexo ? null : p.match(item);
    if (m) {
      const partes = m[1].split('.').map(Number);
      if (partes.length === 2 && partes[1] > anterior) {
        anterior = partes[1];
        const titulo = m[2].length <= 100 && !/[.:;,]$/.test(m[2]) ? ` ${m[2]}` : '';
        secoes.push({ chave: m[1], rotulo: titulo ? `${m[1]}${titulo}` : `item ${m[1]}`, blocos: [] });
      }
      secoes.at(-1)?.blocos.push({ codigo: m[1], nivel: partes.length, paragrafos: [p] });
    } else if (secoes.length) {
      const blocos = secoes.at(-1)!.blocos;
      if (!blocos.length) blocos.push({ codigo: '', nivel: 0, paragrafos: [] });
      blocos.at(-1)!.paragrafos.push(p);
    }
  }

  const saida: SecaoDaNR[] = [];
  const unicas = new Set<string>();
  const chaveLivre = (chave: string) => {
    let c = chave;
    for (let i = 2; unicas.has(c); i++) c = `${chave}-${i}`;
    unicas.add(c);
    return c;
  };
  for (const secao of secoes) {
    // Empacota os blocos em documentos de tamanho razoável: item de terceiro nível (ou mais) é o ponto de corte preferido.
    const grupos: { codigo: string; texto: string }[] = [];
    for (const b of secao.blocos) {
      const texto = b.paragrafos.join('\n');
      const ultimo = grupos.at(-1);
      const pequeno = ultimo && ultimo.texto.length + texto.length < ALVO_DO_DOCUMENTO;
      // Corte só em item de terceiro nível; os subitens mais fundos acompanham o item que os abre.
      if (ultimo && (pequeno || b.nivel > 3)) ultimo.texto += `\n${texto}`;
      else grupos.push({ codigo: b.codigo, texto });
    }
    grupos.forEach((g, i) => {
      // Documento ainda grande (tabela, lista longa): parte nos parágrafos, sem perder nada.
      const partes: string[] = [];
      let atual = '';
      // Um parágrafo sozinho acima do teto (tabela de anexo que o PDF cola numa linha) é cortado em espaço.
      const pedacos = g.texto
        .split('\n')
        .flatMap((par) => (par.length > TETO_DO_DOCUMENTO ? (par.match(/[\s\S]{1,10000}(?:\s|$)/g) ?? [par]) : [par]));
      for (const par of pedacos) {
        if (atual && atual.length + par.length > TETO_DO_DOCUMENTO) {
          partes.push(atual);
          atual = '';
        }
        atual += (atual ? '\n' : '') + par;
      }
      if (atual) partes.push(atual);
      partes.forEach((texto, j) => {
        const primeiro = i === 0 && j === 0;
        const chave = chaveLivre(
          primeiro
            ? secao.chave
            : j === 0
              ? g.codigo || `${secao.chave}-${i + 1}`
              : `${g.codigo || secao.chave}-p${j + 1}`,
        );
        saida.push({
          key: chave,
          label: primeiro ? secao.rotulo : `${secao.rotulo} (item ${chave})`,
          content: texto.trim(),
        });
      });
    });
  }
  return saida.filter((s) => s.content.length >= 20);
}

/** "NR-01": o número com dois algarismos, como o portal e o Ministério escrevem nos títulos. */
export const rotuloDaNR = (numero: number) => `NR-${String(numero).padStart(2, '0')}`;

/**
 * Coleta uma NR da lista curada: lê a página do portal, acha o PDF do texto atual, extrai e divide em seções. Verificada uma vez por dia (requisição
 * condicional ao PDF). Falha de extração (cabeçalho trocado, poucas seções, ou muito menos do que já se tinha) vira erro e não apaga o que já existe.
 */
export async function coletarNR(db: BancoDeDados, nr: NRColetada, full = false) {
  // Defesa em profundidade: a lista é fixa, mas só o portal do Ministério é aceito, mesmo que alguém a edite com um endereço errado.
  if (!urlDoPortalDoTrabalho(nr.pagina))
    throw new Error(`Endereço fora do portal do Ministério recusado: NR-${nr.numero}`);
  const chaveDaVerificacao = `nrs:${nr.numero}:check`;
  const chaveDoPdf = `nrs:${nr.numero}:pdf`;
  const chaveDaData = `nrs:${nr.numero}:lastModified`;
  if (!vencido(db, chaveDaVerificacao, UM_DIA_MS, full)) return { fetched: 0, changed: 0 };

  const pagina = await buscarComEducacao(nr.pagina, { mesmoHost: true });
  if (!pagina.ok) throw new Error(`HTTP ${pagina.status} no portal do Ministério (NR-${nr.numero})`);
  const bytesDaPagina = new Uint8Array(await pagina.arrayBuffer());
  if (bytesDaPagina.length > MAXIMO_DE_BYTES_DA_PAGINA) throw new Error(`Página grande demais (NR-${nr.numero})`);
  const links = linksDe(new TextDecoder('utf-8').decode(bytesDaPagina), nr.pagina, (u) =>
    u.pathname.toLowerCase().endsWith('.pdf'),
  );
  const pdf = pdfDaNR(nr.numero, links);
  if (!pdf) throw new Error(`Extração suspeita (NR-${nr.numero}): PDF do texto da norma não encontrado na página`);

  const mesmoPdf = lerEstado(db, chaveDoPdf)?.value === pdf;
  const anterior = lerEstado(db, chaveDaData)?.value;
  const resposta = await buscarComEducacao(pdf, {
    headers: mesmoPdf && anterior && !full ? { 'If-Modified-Since': anterior } : {},
    mesmoHost: true,
  });
  gravarEstado(db, chaveDaVerificacao, new Date().toISOString());
  if (resposta.status === 304) return { fetched: 2, changed: 0 };
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} no PDF da NR-${nr.numero}`);
  if (!/application\/pdf/i.test(resposta.headers.get('content-type') ?? ''))
    throw new Error(`Extração suspeita (NR-${nr.numero}): o endereço não devolveu um PDF`);
  if (Number(resposta.headers.get('content-length') || 0) > MAXIMO_DE_BYTES_DO_PDF)
    throw new Error(`PDF grande demais (NR-${nr.numero})`);
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  if (bytes.length > MAXIMO_DE_BYTES_DO_PDF)
    throw new Error(`PDF grande demais (NR-${nr.numero}): ${bytes.length} bytes`);
  if (new TextDecoder('latin1').decode(bytes.subarray(0, 5)) !== '%PDF-')
    throw new Error(`Extração suspeita (NR-${nr.numero}): o arquivo não é um PDF`);

  let texto: string;
  try {
    // `pdf-parse` toma posse do buffer; este não é reaproveitado depois.
    texto = await pdfParaTexto(bytes);
  } catch (erro) {
    throw new Error(`PDF ilegível (NR-${nr.numero}): ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  const secoes = dividirNR(texto, nr.numero);
  if (secoes.length < 1) throw new Error(`Extração suspeita (NR-${nr.numero}): nenhuma seção`);
  const antes = (
    db
      .prepare("SELECT COUNT(*) AS n FROM documents WHERE source = 'nrs' AND json_extract(meta, '$.nr') = ?")
      .get(nr.numero) as { n: number }
  ).n;
  if (antes > 10 && secoes.length < antes * 0.6)
    throw new Error(`Extração suspeita (NR-${nr.numero}): ${secoes.length} seções, havia ${antes}`);

  const rotulo = rotuloDaNR(nr.numero);
  const meta = { nr: nr.numero, norma: rotulo, pdf };
  const urls = new Set<string>();
  let alterados = 0;
  for (const s of secoes) {
    const url = `${pdf}#${s.key}`;
    urls.add(url);
    if (
      gravarDocumento(db, {
        source: 'nrs',
        url,
        title: `${rotulo} — ${nr.titulo} — ${s.label}`,
        content: s.content,
        meta: { ...meta, secao: s.key },
      })
    )
      alterados++;
  }
  // Seção que sumiu, ou todas as de uma versão anterior do PDF (o arquivo muda de nome a cada revisão), saem.
  for (const { url } of db
    .prepare("SELECT url FROM documents WHERE source = 'nrs' AND json_extract(meta, '$.nr') = ?")
    .all(nr.numero) as { url: string }[])
    if (!urls.has(url)) db.prepare('DELETE FROM documents WHERE url = ?').run(url);
  gravarEstado(db, chaveDoPdf, pdf);
  const modificado = resposta.headers.get('last-modified');
  if (modificado) gravarEstado(db, chaveDaData, modificado);
  return { fetched: 2, changed: alterados };
}

/** Normas Regulamentadoras vigentes (texto oficial do Ministério do Trabalho e Emprego), um documento por seção. */
export const nrs: Coletor = {
  source: 'nrs',
  label: 'Normas Regulamentadoras (MTE)',
  async run({ db, full }) {
    let buscados = 0;
    let alterados = 0;
    const falhas: string[] = [];
    // Uma NR fora do ar não impede as outras; a falha é relatada no fim para a coleta aparecer como com erro.
    for (const nr of NRS) {
      try {
        const r = await coletarNR(db, nr, full);
        buscados += r.fetched;
        alterados += r.changed;
      } catch (erro) {
        falhas.push(erro instanceof Error ? erro.message : String(erro));
      }
    }
    if (falhas.length) throw new Error(falhas.join('; '));
    return { fetched: buscados, changed: alterados };
  },
};
