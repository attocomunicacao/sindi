import { apagarAusentes, vencido, lerEstado, gravarEstado, gravarDocumento, type BancoDeDados } from '@/lib/dados/db';
import { buscarComEducacao } from '@/lib/dados/http';
import { decodificarHtml, htmlParaLinhas, dividirArtigos, juntarQuebras } from '@/lib/dados/legal';
import { NORMAS, urlDoPlanalto, type NormaColetada } from '@/lib/dados/legislacao-lista';
import type { Coletor } from '@/lib/dados/coletores/tipos';

const UM_DIA_MS = 24 * 60 * 60 * 1000;
/** A maior norma da lista (a CLT) tem 3,5 MB de HTML; acima disso a página não é a que se espera e não vale decodificar. */
const MAXIMO_DE_BYTES = 12 * 1024 * 1024;
/** Teto do texto de um artigo. As leis que alteram outras (13.467, por exemplo) têm um primeiro artigo de dezenas de milhares de caracteres. */
const MAXIMO_POR_ARTIGO = { artigos: 20_000, sequencial: 150_000 };

/**
 * Ementa: o trecho entre o cabeçalho da norma e o preâmbulo ("O PRESIDENTE DA REPÚBLICA...", "As Mesas..."). É nela que a lei diz o que é
 * ("Dispõe sobre o trabalho temporário...") e o que altera ("Altera dispositivos da Lei nº 6.019...").
 */
export function extrairEmenta(linhas: string[]) {
  const inicio = linhas.findIndex((l) => /^(Dispõe|Altera|Aprova|Institui|Acrescenta|Regulamenta)\b/.test(l));
  if (inicio < 0) return undefined;
  const fim = linhas.findIndex((l, i) => i > inicio && /^(O( PRESIDENTE)?|As( Mesas)?|Faço saber|Art\.)\b/.test(l));
  const texto = linhas
    .slice(inicio, fim < 0 ? inicio + 4 : fim)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return texto.length >= 20 && texto.length <= 1500 ? texto : undefined;
}

/**
 * Coleta uma norma da lista curada. Verificada uma vez por dia com requisição condicional (Last-Modified). Falha de extração
 * (poucos artigos, ou muito menos do que já se tinha) vira erro e não apaga o que já está guardado.
 */
export async function coletarNorma(db: BancoDeDados, norma: NormaColetada, full = false) {
  // Defesa em profundidade: a lista é fixa, mas só o Planalto é aceito, mesmo que alguém a edite com um endereço errado.
  if (!urlDoPlanalto(norma.url)) throw new Error(`Endereço fora do Planalto recusado: ${norma.id}`);
  const chaveDaVerificacao = `legislacao:${norma.id}:check`;
  const chaveDaData = `legislacao:${norma.id}:lastModified`;
  if (!vencido(db, chaveDaVerificacao, UM_DIA_MS, full)) return { fetched: 0, changed: 0 };
  const anterior = lerEstado(db, chaveDaData)?.value;
  const resposta = await buscarComEducacao(norma.url, {
    headers: anterior && !full ? { 'If-Modified-Since': anterior } : {},
    mesmoHost: true,
  });
  gravarEstado(db, chaveDaVerificacao, new Date().toISOString());
  if (resposta.status === 304) return { fetched: 1, changed: 0 };
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} no Planalto (${norma.id})`);
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  if (bytes.length > MAXIMO_DE_BYTES) throw new Error(`Página grande demais (${norma.id}): ${bytes.length} bytes`);
  // O HTML do Planalto quebra linha até entre "Art." e o número ("Art.\n10."): as linhas são coladas antes de procurar os artigos.
  const texto = htmlParaLinhas(decodificarHtml(bytes, resposta.headers.get('content-type') ?? ''), {
    semRiscado: true,
  });
  const linhas = juntarQuebras(texto).split('\n');
  const inicio = norma.desde ? linhas.findIndex((l) => norma.desde!.test(l)) : 0;
  if (inicio < 0) throw new Error(`Extração suspeita (${norma.id}): início do texto não encontrado`);
  const artigos = dividirArtigos(linhas.slice(inicio).join('\n'), {
    sequencial: norma.modo === 'sequencial',
    maxChars: MAXIMO_POR_ARTIGO[norma.modo],
  });
  if (artigos.length < norma.minimoDeArtigos)
    throw new Error(`Extração suspeita (${norma.id}): apenas ${artigos.length} artigos`);
  const prefixo = `${norma.url}#`;
  const antes = (
    db
      .prepare('SELECT COUNT(*) AS n FROM documents WHERE source = ? AND substr(url, 1, ?) = ?')
      .get('legislacao', prefixo.length, prefixo) as { n: number }
  ).n;
  if (antes > 10 && artigos.length < antes * 0.6)
    throw new Error(`Extração suspeita (${norma.id}): ${artigos.length} artigos, havia ${antes}`);

  const meta = { lei: norma.id, norma: norma.titulo };
  const documentos = artigos.map((a) => ({
    key: a.key,
    title: `${norma.titulo} — ${a.label}`,
    content: a.content,
  }));
  const ementa = extrairEmenta(
    linhas.slice(
      0,
      Math.max(
        0,
        linhas.findIndex((l) => /^Art\.\s*1/.test(l)),
      ),
    ),
  );
  if (ementa)
    documentos.unshift({ key: 'ementa', title: `${norma.titulo} — Ementa`, content: `${norma.titulo}. ${ementa}` });
  let alterados = 0;
  for (const d of documentos)
    if (
      gravarDocumento(db, { source: 'legislacao', url: `${prefixo}${d.key}`, title: d.title, content: d.content, meta })
    )
      alterados++;
  apagarAusentes(db, 'legislacao', prefixo, new Set(documentos.map((d) => `${prefixo}${d.key}`)));
  const modificado = resposta.headers.get('last-modified');
  if (modificado) gravarEstado(db, chaveDaData, modificado);
  return { fetched: 1, changed: alterados };
}

/** Normas trabalhistas e emendas da lista curada (Lei 6.019/1974, 13.429/2017, 13.467/2017, CLT, EC 141/2026), um documento por artigo. */
export const legislacao: Coletor = {
  source: 'legislacao',
  label: 'Legislação (Planalto)',
  async run({ db, full }) {
    let buscados = 0;
    let alterados = 0;
    const falhas: string[] = [];
    // Uma norma fora do ar não impede as outras; a falha é relatada no fim para a coleta aparecer como com erro.
    for (const norma of NORMAS) {
      try {
        const r = await coletarNorma(db, norma, full);
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
