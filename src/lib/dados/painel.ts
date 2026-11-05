import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from './db';
import { isPercent } from './format';

export type PainelIndicator = { id: string; group: string; label: string; value: number; unit: string; period: string; previous: number | null; source: string; url: string; fetchedAt: string };
export type PainelBill = { source: string; title: string; summary: string; situacao: string | null; movedAt: string | null; url: string };
export type PainelNews = { source: string; title: string; publishedAt: string | null; url: string };
export type Painel = { available: boolean; updatedAt: string | null; indicators: PainelIndicator[]; bills: PainelBill[]; news: PainelNews[]; sindicato: { noticias: PainelNews[]; artigos: PainelNews[] }; sources: { source: string; lastOk: string | null; status: string }[]; series: Record<string, { period: string; value: number }[]> };

/** Ordem de exibição dos indicadores; os demais, se existirem, vêm depois. */
export const INDICATOR_ORDER = ['bcb.selic-meta', 'ibge.ipca-12m', 'ibge.ipca-mensal', 'ibge.desocupacao', 'caged.saldo', 'caged.saldo-sp', 'caged.saldo-temporario', 'caged.saldo-servicos', 'ibge.servicos'];
export { isPercent };
/** Projetos que importam à terceirização e ao trabalho temporário. */
export const BILL_TOPIC = /terceiriz|trabalho tempor[aá]ri|6\.?019|escala 6\s?x\s?1|jornada de trabalho|contribui[cç][aã]o sindical|reforma trabalhista|13\.?467|13\.?429/i;
/** Notícias do IBGE só entram se tratarem de trabalho ou economia. */
export const IBGE_NEWS_TOPIC = /emprego|trabalh|desocup|ocupa[cç]|servi[cç]os|infla[cç]|ipca|pib|renda|sal[aá]rio|ind[uú]stria|economia|com[eé]rcio/i;
const NEWS_SOURCES = ['tst', 'wec', 'ibge', 'mte'];

const headline = (content: string) => content.split(String.fromCharCode(10))[0].trim();
export function emptyPainel(): Painel { return { available: false, updatedAt: null, indicators: [], bills: [], news: [], sindicato: { noticias: [], artigos: [] }, sources: [], series: {} }; }

export function readPainel(file = dbPath()): Painel {
  if (!existsSync(file)) return emptyPainel();
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const indicators = (db.prepare('SELECT id, grp, label, value, unit, period, previous, source, url, fetched_at FROM indicators').all() as Record<string, string | number | null>[])
      .map(r => ({ id: String(r.id), group: String(r.grp), label: String(r.label), value: Number(r.value), unit: String(r.unit), period: String(r.period), previous: r.previous === null ? null : Number(r.previous), source: String(r.source), url: String(r.url), fetchedAt: String(r.fetched_at) }))
      .sort((a, b) => (INDICATOR_ORDER.indexOf(a.id) + 1 || 99) - (INDICATOR_ORDER.indexOf(b.id) + 1 || 99));
    const rows = db.prepare(`SELECT source, title, content, url, json_extract(meta, '$.situacao') AS situacao, json_extract(meta, '$.movedAt') AS movedAt
      FROM documents WHERE source IN ('camara','senado') ORDER BY COALESCE(json_extract(meta, '$.movedAt'), published_at) DESC LIMIT 400`).all() as { source: string; title: string; content: string; url: string; situacao: string | null; movedAt: string | null }[];
    const bills = rows.filter(r => BILL_TOPIC.test(headline(r.content))).slice(0, 8).map(r => ({
      source: r.source, title: r.title, summary: headline(r.content).replace(/^[^—]*—\s*/, '').slice(0, 220), situacao: r.situacao, movedAt: r.movedAt, url: r.url }));
    const allNews = db.prepare(`SELECT source, title, published_at AS publishedAt, url FROM documents WHERE source IN (${NEWS_SOURCES.map(() => '?').join(',')})
      AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 80`).all(...NEWS_SOURCES) as PainelNews[];
    const news = allNews.filter(n => n.source !== 'ibge' || IBGE_NEWS_TOPIC.test(n.title)).slice(0, 12);
    const posts = (section: string, limit: number) => db.prepare(`SELECT source, title, published_at AS publishedAt, url FROM documents WHERE source = 'sindeprestem' AND json_extract(meta, '$.section') = ? AND url LIKE '%/post/%'
      AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT ?`).all(section, limit) as PainelNews[];
    const sindicato = { noticias: posts('noticia', 8), artigos: posts('artigo', 4) };
    const sources = db.prepare(`SELECT source, MAX(CASE WHEN status = 'ok' THEN finished_at END) AS lastOk,
      (SELECT status FROM runs r2 WHERE r2.source = runs.source ORDER BY id DESC LIMIT 1) AS status FROM runs GROUP BY source`).all() as Painel['sources'];
    const updatedAt = sources.map(s => s.lastOk).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;
    // Série mensal já guardada pela coleta (hoje, o saldo do Novo CAGED): alimenta os gráficos de evolução do painel.
    const series: Painel['series'] = {};
    for (const r of db.prepare('SELECT id, period, value FROM series ORDER BY id, period').all() as { id: string; period: string; value: number }[]) (series[r.id] ??= []).push({ period: r.period, value: r.value });
    return { available: true, updatedAt, indicators, bills, news, sindicato, sources, series };
  } finally { db.close(); }
}

const SOURCE_LABELS: Record<string, string> = { camara: 'Câmara dos Deputados', senado: 'Senado Federal', tst: 'TST', wec: 'World Employment Confederation', ibge: 'IBGE', mte: 'Ministério do Trabalho e Emprego', caged: 'Novo CAGED', constituicao: 'Constituição Federal', regimentos: 'Regimentos' };
/** Trechos das fontes externas coletadas, para o chat citar; só quando a pergunta pede essas fontes. */
export const EXTERNAL_INTENT = /c[aâ]mara|senado|deputad|senador|projeto de lei|\bpls?\b|\bplp\b|\bpec\b|tramita|congresso|\btst\b|tribunal superior|s[uú]mula|\bibge\b|\bwec\b|world employment|\bmte\b|minist[eé]rio do trabalho|norma regulamentadora|\bnr-?\s?\d|\bcaged\b|constitui[cç][aã]o|regimento/i;
export function searchExternal(terms: string[], limit = 3, file = dbPath()) {
  if (!existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const words = terms.map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(t => t.length >= 3);
    if (!words.length) return [];
    return (db.prepare(`SELECT d.url, d.source, d.title, substr(d.content, 1, 900) AS content, d.fetched_at AS fetchedAt FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
      WHERE documents_fts MATCH ? AND d.source IN ('camara','senado','tst','wec','ibge','mte','caged','constituicao','regimentos') ORDER BY bm25(documents_fts, 4.0, 1.0) LIMIT ?`).all(words.map(w => `"${w}"*`).join(' OR '), limit) as { url: string; source: string; title: string; content: string; fetchedAt: string }[])
      .map(r => ({ url: r.url, title: `${SOURCE_LABELS[r.source]} — ${r.title}`, content: r.content, fetchedAt: r.fetchedAt }));
  } catch { return []; } finally { db.close(); }
}
const INDICATOR_QUESTIONS: [RegExp, string[]][] = [
  [/\bselic\b|juros b[aá]sicos|taxa b[aá]sica de juros/, ['bcb.selic-meta']],
  [/\bipca\b|infla[cç][aã]o|inflation/, ['ibge.ipca-12m', 'ibge.ipca-mensal']],
  [/desemprego|desocupa[cç][aã]o|unemployment|\bpnad\b/, ['ibge.desocupacao']],
  [/\bcaged\b|empregos? forma(l|is)|empregos? (foram )?(gerados|criados)|vagas formais|saldo de (emprego|vagas)|mercado de trabalho/, ['caged.saldo', 'caged.saldo-sp', 'caged.saldo-servicos', 'caged.saldo-temporario']],
  [/volume de servi[cç]os|pesquisa mensal de servi[cç]os|\bpms\b/, ['ibge.servicos']],
];
const ROTULO_DA_FONTE: Record<string, string> = { bcb: 'Banco Central', ibge: 'IBGE', caged: 'Novo CAGED (Ministério do Trabalho e Emprego)' };
/**
 * Um indicador como frase completa, com o sentido do número já dito ("abriu", "fechou", "subiu", "caiu"). Um modelo pequeno copia bem uma frase, mas erra ao
 * interpretar sinal e variação: aqui a conta e a comparação são feitas pelo código, e o modelo só escolhe e redige.
 */
export function fraseDoIndicador(i: PainelIndicator, locale = 'pt-BR'): string {
  const numero = (valor: number) => Math.abs(valor).toLocaleString(locale, isPercent(i.unit) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  const fonte = ROTULO_DA_FONTE[i.source] ?? i.source.toUpperCase();
  if (/vagas/.test(i.unit)) {
    // O dado mais recente vem primeiro e rotulado: medido, até o modelo de 3B respondeu com o número do mês anterior quando os dois vinham na mesma oração.
    const saldo = (valor: number) => `${valor < 0 ? 'fechou' : 'abriu'} ${numero(valor)} vagas formais`;
    return `${i.label}, dado mais recente (${i.period}): ${saldo(i.value)} (admissões menos demissões). Fonte: ${fonte}.${i.previous != null ? ` Para comparação, no mês anterior: ${saldo(i.previous)}.` : ''}`;
  }
  const sinal = (valor: number) => `${valor < 0 ? '-' : ''}${numero(valor)}`;
  const variacao = i.previous == null ? '' : i.value > i.previous ? `; subiu em relação ao valor anterior (${sinal(i.previous)})` : i.value < i.previous ? `; caiu em relação ao valor anterior (${sinal(i.previous)})` : `; igual ao valor anterior (${sinal(i.previous)})`;
  return `${i.label}: ${sinal(i.value)} ${i.unit} (${i.period})${variacao}. Fonte: ${fonte}.`;
}
/** Recortes do Novo CAGED que a pergunta cita (serviços, trabalho temporário, São Paulo); sem recorte citado, todos. Menos números na fonte, menos troca de número na resposta. */
function recorteDoCaged(q: string, ids: string[]): string[] {
  const pedidos = [/servic/.test(q) && 'caged.saldo-servicos', /temporari/.test(q) && 'caged.saldo-temporario', /sao paulo|paulista|\bsp\b|estado/.test(q) && 'caged.saldo-sp'].filter((id): id is string => Boolean(id));
  return pedidos.length ? ids.filter(id => !id.startsWith('caged.') || pedidos.includes(id)) : ids;
}
/**
 * Números oficiais mais recentes que a pergunta menciona, entregues ao modelo como trechos (um por indicador, com a fonte); a SINDI explica o número
 * com palavras próprias em vez de devolver uma ficha pronta. Perguntas de definição ("O que é o CAGED?") não trazem números: vão ao glossário do cérebro.
 */
export function indicatorPassages(question: string, language: string, file = dbPath()): TrechoDoc[] {
  const q = question.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (/redij|escrev|reescrev|traduz|draft|write|translate/.test(q)) return [];
  if (/^(o que (e|significa|quer dizer)|what (is|does)|para que serve|defina|qual (e )?o significado)/.test(q.trim()) && /\b(caged|pnad|pms|ipca|selic)\b/.test(q)) return [];
  const ids = recorteDoCaged(q, INDICATOR_QUESTIONS.filter(([test]) => test.test(q)).flatMap(([, list]) => list));
  if (!ids.length || !existsSync(file)) return [];
  // Recorte que só existe como série mensal (trabalho temporário ou serviços no Estado de São Paulo): os dois últimos meses, como um indicador.
  const emSp = /sao paulo|paulista|\bsp\b/.test(q); const serieSp = emSp && /temporari/.test(q) ? 'caged.saldo-temporario-sp' : emSp && /servic/.test(q) ? 'caged.saldo-servicos-sp' : undefined;
  if (serieSp && ids.some(id => id.startsWith('caged.'))) {
    const painel = readPainel(file); const serie = painel.series[serieSp] ?? []; const base = painel.indicators.find(i => i.id === serieSp.replace(/-sp$/, ''));
    const mes = (p: string) => p.replace(/^(\d{4})-?(\d{2}).*$/, '$2/$1');
    if (serie.length && base) return [{ url: base.url, title: `${base.label} — Estado de São Paulo`, fetchedAt: base.fetchedAt, pinned: true as const,
      content: fraseDoIndicador({ ...base, label: `${base.label} — Estado de São Paulo`, value: serie.at(-1)!.value, period: mes(serie.at(-1)!.period), previous: serie.at(-2)?.value ?? null }, language === 'en' ? 'en-US' : 'pt-BR') }];
  }
  return readPainel(file).indicators.filter(i => ids.includes(i.id)).map(i => ({ url: i.url, title: i.label, fetchedAt: i.fetchedAt, pinned: true as const, content: fraseDoIndicador(i, language === 'en' ? 'en-US' : 'pt-BR') }));
}

const norm = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const dateBr = (value: string | null | undefined, language: string) => value ? new Date(value).toLocaleDateString(language === 'en' ? 'en-GB' : 'pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
/** Artigo citado na pergunta ("art. 7º", "artigo 5-A"); devolve a chave usada nas URLs (7, 5-A). */
export function articleKey(question: string) {
  const m = norm(question).match(/\bart(?:igo|\.)?\s*(\d{1,4})\s*(?:[-º°o]\s*)?([a-z])?\b/);
  if (!m) return undefined;
  const suffix = m[2] && /^[a-z]$/.test(m[2]) && /art(?:igo|\.)?\s*\d+\s*[-º°o]?\s*[a-z]\b/.test(norm(question)) ? `-${m[2].toUpperCase()}` : '';
  return m[1] + suffix;
}
/** Palavras que não ajudam a achar o trecho certo dentro de um documento longo (perguntas do tipo "como a NR-1 impacta minha empresa?"). */
const GENERICAS_DOC = new Set('como qual quais quem onde quando porque para pode posso preciso precisa impacta impacto impactar afeta afetar minha meu minhas meus vida empresa empresas sobre isso esta esse essa diz fala dizem norma normas regulamentadora regulamentadoras artigo artigos constituicao regimento federal explique explica significa quer dizer exemplo'.split(' '));
export type TrechoDoc = { url: string; title: string; content: string; fetchedAt: string; pinned: true };
export type TrechosDeDocumentos = { passages: TrechoDoc[]; semResposta?: string; lista?: boolean };
/** Termos da pergunta que distinguem o assunto dentro do documento, sem os rótulos ("NR", número) e sem palavras genéricas. */
export function termosDoDocumento(question: string) {
  return [...new Set((norm(question).match(/[a-z0-9]{4,}/g) ?? []).filter(w => !GENERICAS_DOC.has(w) && !STOP.has(w) && !/^\d+$/.test(w)))].slice(0, 8);
}
/**
 * Escolhe de um texto longo os blocos que mais combinam com a pergunta, mais o começo (que costuma definir o assunto), em ordem de leitura.
 * É o que permite à SINDI responder com o contexto da pergunta em vez de devolver sempre o mesmo início do documento.
 */
export function trechosRelevantes(texto: string, termos: string[], maximo = 1600, bloco = 600): string {
  const blocos: string[] = []; let atual = '';
  for (const paragrafo of texto.split(/\n+/).map(p => p.trim()).filter(Boolean)) {
    if (atual && `${atual}\n${paragrafo}`.length > bloco) { blocos.push(atual); atual = ''; }
    atual = atual ? `${atual}\n${paragrafo}` : paragrafo;
  }
  if (atual) blocos.push(atual);
  const limitados = blocos.map(b => b.length > bloco * 1.5 ? b.slice(0, Math.floor(bloco * 1.5)).replace(/\s+\S*$/, '') + ' […]' : b);
  if (limitados.join('\n').length <= maximo) return limitados.join('\n');
  const escolhidos = new Set([0]); let tamanho = limitados[0].length;
  const pontuados = limitados.map((b, i) => ({ i, b, pontos: termos.filter(t => norm(b).includes(t)).length })).slice(1).sort((x, y) => y.pontos - x.pontos || x.i - y.i);
  for (const { i, b, pontos } of pontuados) { if (!pontos) break; if (tamanho + b.length > maximo) continue; escolhidos.add(i); tamanho += b.length; }
  return [...escolhidos].sort((x, y) => x - y).map(i => limitados[i]).join('\n[…]\n');
}
/**
 * Artigo da Constituição ou de um regimento citado na pergunta, ou os trechos que mais combinam com ela. Devolve o texto-fonte para o modelo
 * explicar com as próprias palavras; quem apresenta a resposta ao usuário é a SINDI, não uma cópia da lei.
 */
export function lawPassages(question: string, terms: string[], language: string, file = dbPath()): TrechosDeDocumentos {
  const q = norm(question);
  if (/redij|escrev|reescrev|traduz|draft|write|translate/.test(q) || !existsSync(file)) return { passages: [] };
  const constitution = /constituicao|carta magna|\bcf\b|\bcf\/?88\b|constitution/.test(q);
  const regiment = /regimento|rules of procedure/.test(q) ? (/camara|deputad/.test(q) ? 'ricd' : /senado|senador/.test(q) ? 'risf' : /congresso/.test(q) ? 'rccn' : undefined) : undefined;
  if (!constitution && !regiment) return { passages: [] };
  const key = articleKey(question); const adct = /\badct\b|disposicoes constitucionais transitorias/.test(q);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (key) {
      const row = (constitution
        ? db.prepare("SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'constituicao' AND url LIKE ? LIMIT 1").get(`%#${adct ? 'adct-' : ''}${key}`)
        : db.prepare("SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'regimentos' AND json_extract(meta, '$.regiment') = ? AND url LIKE ? ORDER BY length(content) DESC LIMIT 1").get(regiment ?? '', `%#${key}`)) as { title: string; url: string; content: string; fetchedAt: string } | undefined;
      if (!row) return { passages: [], semResposta: language === 'en' ? 'I could not find that article in the collected official text.' : 'Não encontrei esse artigo no texto oficial coletado.' };
      return { passages: [{ url: row.url.split('#')[0], title: row.title, content: trechosRelevantes(row.content, termosDoDocumento(question), 1600), fetchedAt: row.fetchedAt, pinned: true }] };
    }
    const words = terms.map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(t => t.length >= 4 && !/^(constituicao|regimento|diz|fala|preve|artigo|federal)$/.test(norm(t)));
    if (!words.length) return { passages: [] };
    const source = constitution ? 'constituicao' : 'regimentos';
    const rows = db.prepare(`SELECT d.title, d.url, substr(d.content, 1, 900) AS content, d.fetched_at AS fetchedAt FROM documents_fts f JOIN documents d ON d.rowid = f.rowid WHERE documents_fts MATCH ? AND d.source = ?
      ${regiment ? "AND json_extract(d.meta, '$.regiment') = ?" : ''} ORDER BY bm25(documents_fts, 4.0, 1.0) LIMIT 3`).all(words.map(w => `"${w}"*`).join(' OR '), source, ...(regiment ? [regiment] : [])) as { title: string; url: string; content: string; fetchedAt: string }[];
    return { passages: rows.map(r => ({ url: r.url.split('#')[0], title: r.title, content: r.content.replace(/\s+/g, ' ').trim(), fetchedAt: r.fetchedAt, pinned: true as const })) };
  } catch { return { passages: [] }; } finally { db.close(); }
}

export const SST_PAGE = 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho';
/** Número da Norma Regulamentadora citada ("NR-1", "NR 17", "norma regulamentadora nº 35"). */
export function nrNumber(question: string) {
  const m = norm(question).match(/\bnr[-\s]?0?(\d{1,2})\b|norma regulamentadora\s*(?:n[ºo.]?\s*)?0?(\d{1,2})\b/);
  return m ? Number(m[1] ?? m[2]) : undefined;
}
/**
 * Norma Regulamentadora citada na pergunta: devolve os blocos do texto coletado do portal do Ministério que mais combinam com a pergunta
 * (e o começo, que define a norma), para o modelo explicar. Se a página não foi coletada, orienta a fonte oficial; o modelo não descreve NR de memória.
 */
export function nrPassages(question: string, language: string, file = dbPath()): TrechosDeDocumentos {
  const number = nrNumber(question);
  if (number === undefined || /redij|escrev|reescrev|traduz|draft|write|translate/.test(norm(question))) return { passages: [] };
  const padded = String(number).padStart(2, '0');
  let row: { title: string; url: string; content: string; fetchedAt: string } | undefined;
  if (existsSync(file)) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const patterns = [`%nr-${padded}%`, `%nr-${number}-%`, `%nr-${number}`, `%norma-regulamentadora-no-${padded}%`, `%norma-regulamentadora-n-${number}%`, `%norma-regulamentadora-${number}-%`];
      const titles = [`NR ${padded}%`, `NR-${padded}%`, `NR ${number} %`, `NR-${number} %`, `Norma Regulamentadora ${padded}%`, `Norma Regulamentadora ${number} %`, `Norma Regulamentadora nº ${number}%`, `NR ${number}`];
      const where = [...patterns.map(() => 'lower(url) LIKE ?'), ...titles.map(() => 'title LIKE ?')].join(' OR ');
      row = db.prepare(`SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'mte' AND (${where}) ORDER BY (url LIKE '%normas-regulamentadoras-vigentes/%') DESC, (lower(url) LIKE '%/nr-' || ? OR lower(url) LIKE '%-nr-' || ?) DESC, length(content) DESC LIMIT 1`).get(...patterns, ...titles, String(number), String(number)) as typeof row;
    } catch { row = undefined; } finally { db.close(); }
  }
  if (row) return { passages: [{ url: row.url, title: row.title, content: trechosRelevantes(row.content, termosDoDocumento(question), 1600), fetchedAt: row.fetchedAt, pinned: true }] };
  return { passages: [], semResposta: language === 'en'
    ? `I did not find NR-${number} in the collected official text, so I will not describe it from memory. See the Ministry of Labour [occupational safety and health page](${SST_PAGE}).`
    : `Não encontrei a NR-${number} no texto oficial coletado, então não vou descrevê-la de memória. Consulte a página de [segurança e saúde no trabalho](${SST_PAGE}) do Ministério do Trabalho e Emprego.` };
}

type DocRow = { title: string; url: string; content: string; published_at: string | null; category: string | null; year: number | null; kind: string | null; region: string | null };
const CATEGORY_WORDS: [RegExp, string][] = [[/poupatempo|detran/, 'Poupatempo'], [/portaria|porteir|controle de acesso|controlador de acesso/, 'Portaria'], [/promo[cç]|merchandising/, 'Promoção e merchandising'], [/leiturista|leitura|agua|energia/, 'Leiturista'],
  [/promotores? de credito|credito/, 'Promotores de crédito'], [/bombeiro/, 'Bombeiros'], [/\bgeral\b/, 'Geral']];
/**
 * Documentos do próprio SINDEPRESTEM que a pergunta pede (convenções e aditivos por categoria e ano, cartilhas, documentos jurídicos, notícias e artigos recentes),
 * como trechos com título, data e início do texto. O modelo apresenta a lista com palavras próprias; as referências ao final levam a cada documento.
 * Perguntas sobre o conteúdo de uma cláusula seguem para `clausePassages`, e as institucionais para o cérebro.
 */
const ROTULO_DA_SECAO: Record<string, string> = { convencao: 'convenção coletiva', cartilha: 'cartilha', juridico: 'documento jurídico', noticia: 'notícia', artigo: 'artigo do presidente' };
export function sindicatoPassages(question: string, language: string, file = dbPath()): TrechoDoc[] {
  const q = norm(question);
  if (/redij|escrev|reescrev|traduz|draft|write|translate/.test(q) || !existsSync(file)) return [];
  const convention = CONVENCAO_RE.test(q) && !/artigo|noticia/.test(q);
  const cartilha = /cartilha|booklet|handbook/.test(q);
  const legal = /(documentos?|textos?|arquivos?|leis?|legislacao|decretos?|portarias?).*(juridic|legislac|sindeprestem)|juridic.*(documentos?|legislac)|legal documents/.test(q);
  const news = /(ultimas?|recentes?|novidades?|latest|recent).*(noticias?|news)|noticias.*(sindeprestem|sindicato)|novidades do (sindeprestem|sindicato)/.test(q);
  const articles = /(ultimos?|recentes?|latest|recent)?\s*artigos?.*(vander|presidente|sindeprestem|sindicato)|artigos? (do|de) (vander|presidente)|ultimos artigos|recent articles/.test(q);
  if (convention && perguntaDeClausula(q)) return [];
  const section = convention ? 'convencao' : cartilha ? 'cartilha' : legal ? 'juridico' : news ? 'noticia' : articles ? 'artigo' : undefined;
  if (!section) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const select = `SELECT title, url, content, published_at, fetched_at AS fetchedAt, json_extract(meta, '$.category') AS category, json_extract(meta, '$.year') AS year, json_extract(meta, '$.type') AS kind, json_extract(meta, '$.region') AS region
      FROM documents WHERE source = 'sindeprestem' AND json_extract(meta, '$.section') = ? AND json_extract(meta, '$.listing') IS NULL`;
    type Linha = DocRow & { fetchedAt: string };
    let rows: Linha[];
    if (section === 'convencao') {
      const wanted = CATEGORY_WORDS.find(([test]) => test.test(q))?.[1];
      const year = Number(q.match(/\b(20\d{2})\b/)?.[1]) || undefined;
      const jundiai = /jundiai/.test(q);
      const all = db.prepare(`${select} AND url LIKE '%.pdf' ORDER BY COALESCE(json_extract(meta, '$.year'), 0) DESC, title`).all('convencao') as Linha[];
      rows = all.filter(r => (!wanted || r.category === wanted) && (!year || r.year === year) && (!jundiai || r.region === 'Jundiaí'));
      if (!year) { const latest = Math.max(...rows.map(r => r.year ?? 0)); rows = rows.filter(r => (r.year ?? 0) >= latest - 1); }
    } else if (section === 'cartilha') rows = db.prepare(`${select} AND url LIKE '%.pdf' ORDER BY title`).all('cartilha') as Linha[];
    else if (section === 'juridico') {
      // Edições mensais da mesma norma aparecem uma vez, com a contagem.
      const all = db.prepare(`${select} AND url LIKE '%.pdf' ORDER BY COALESCE(json_extract(meta, '$.year'), 0) DESC, published_at DESC, title`).all('juridico') as Linha[];
      const groups = new Map<string, Linha[]>();
      for (const r of all) { const key = r.title.split(' — ')[0]; groups.set(key, [...(groups.get(key) ?? []), r]); }
      rows = [...groups.entries()].map(([key, list]) => ({ ...list[0], title: list.length > 1 ? `${key} (${list.length} ${language === 'en' ? 'monthly editions, latest' : 'edições mensais, a mais recente'})` : list[0].title }));
    } else rows = db.prepare(`${select} AND url LIKE '%/post/%' AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 6`).all(section) as Linha[];
    // Lista de documentos: título, tipo e data bastam. Descrições curtas de PDFs levam o modelo pequeno a inventar o assunto de documentos que ele não leu, e a lista com os links vai nas referências.
    const semTexto = (r: { content: string }) => /PDF digitalizado/.test(r.content) || r.content.trim().length < 120;
    return [...rows].sort((a, b) => Number(semTexto(a)) - Number(semTexto(b))).slice(0, 8).map(r => ({
      url: r.url, title: r.title, fetchedAt: r.fetchedAt, pinned: true as const,
      content: [`Documento publicado pelo SINDEPRESTEM (${ROTULO_DA_SECAO[section] ?? 'documento'}): ${r.title}`, [r.kind, r.category, r.year].filter(Boolean).join(', '), r.published_at ? `publicado em ${dateBr(r.published_at, language)}` : '', semTexto(r) ? 'documento digitalizado, sem texto disponível' : ''].filter(Boolean).join('. '),
    }));
  } catch { return []; } finally { db.close(); }
}
const SITE_URL = 'https://www.sindeprestem.com.br';

const STOP = new Set('qual quais como onde quando para por com que uma uns umas dos das nos nas pelo pela sobre este esta esse essa existe tem ter ser sao foi aos aquele convencao convencoes coletiva coletivas cct ccts aditivo sindicato sindeprestem trabalhador trabalhadores empresa empresas categoria'.split(' '));
const SYNONYMS: Record<string, string[]> = { piso: ['piso salarial', 'salario normativo', 'salario base', 'salarios'], reajuste: ['reajuste', 'correcao salarial', 'data-base', 'data base'], vale: ['vale refeicao', 'vale alimentacao', 'tickets', 'cesta basica'] };
const NL = String.fromCharCode(10);
const CONVENCAO_RE = /convenc|\bccts?\b|aditivo|acordo coletivo|collective (agreement|bargaining)/;
// Perguntas sobre o conteúdo de uma cláusula seguem para a busca no texto das convenções, não para a lista de documentos.
const CLAUSULA_RE = /clausula|piso|salario|reajuste|vale|auxilio|jornada|hora extra|adicional|beneficio|ferias|rescis|multa|estabilidade|contribuicao|quanto|valor|prazo|direito|obrigat|pode |posso /;
/** Pergunta sobre o conteúdo de uma cláusula de convenção coletiva (e não sobre a lista de documentos). `q` já normalizada. */
// "Como apresentar ao cliente o reajuste da convenção?" pede método, não o texto da cláusula.
export const perguntaDeClausula = (q: string) => CONVENCAO_RE.test(q) && !/artigo|noticia|cliente|apresentar|explicar/.test(q) && CLAUSULA_RE.test(q);
/**
 * Pergunta sobre o conteúdo de uma cláusula: devolve trechos do texto da convenção mais recente da categoria citada, com link, para o modelo
 * explicar. Sem trecho aplicável, devolve `semResposta`; o modelo não responde valores de convenção de memória.
 */
export function clausePassages(question: string, language: string, file = dbPath()): TrechosDeDocumentos {
  const en = language === 'en'; const q = norm(question);
  const wanted = CATEGORY_WORDS.find(([test]) => test.test(q))?.[1]; const anos = [...q.matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1])); const year = anos.length ? Math.max(...anos) : undefined;
  const terms = [...new Set((q.match(/[a-z0-9]{4,}/g) ?? []).filter(w => !STOP.has(w) && !/^\d{4}$/.test(w)))].slice(0, 8);
  const phrases = [...new Set(terms.flatMap(t => SYNONYMS[t] ?? []))]; const chaves = terms.filter(t => SYNONYMS[t]);
  // Sem categoria citada, o cargo ou assunto da pergunta (ex.: "técnico de segurança") precisa aparecer no trecho; só "piso" não basta, senão a cláusula de outra categoria seria devolvida.
  const cargo = wanted ? [] : terms.filter(t => !SYNONYMS[t] && !/^(valor|valores|trabalho|quanto|minimo|maximo|vigente|atual)$/.test(t));
  if (!existsSync(file)) return { passages: [] };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const docs = db.prepare(`SELECT title, url, content, fetched_at AS fetchedAt, json_extract(meta, '$.category') AS category, json_extract(meta, '$.year') AS year, json_extract(meta, '$.type') AS type FROM documents
      WHERE source = 'sindeprestem' AND json_extract(meta, '$.section') = 'convencao' AND url LIKE '%.pdf' AND length(content) > 2000`).all() as { title: string; url: string; content: string; fetchedAt: string; category: string | null; year: number | null; type: string | null }[];
    const pool = docs.filter(d => (!wanted || d.category === wanted) && (!anos.length || anos.includes(d.year ?? 0)) && !/jundia/i.test(d.title));
    const latest = Math.max(0, ...pool.map(d => d.year ?? 0));
    const candidates = pool.filter(d => d.type === 'Convenção coletiva' && (d.year ?? 0) >= (year ?? latest)).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 2);
    if (!candidates.length) return { passages: [], semResposta: `${en ? 'I did not find the agreement for that category and year. See' : 'Não encontrei a convenção dessa categoria e ano. Veja'} [${en ? 'Collective documents' : 'Documentos coletivos'}](${SITE_URL}/convencoes-coletivas).` };
    const passages: TrechoDoc[] = [];
    for (const doc of candidates) {
      const all = doc.content.split(NL); const wins: { score: number; at: number }[] = [];
      for (let i = 0; i < all.length; i += 4) {
        const window = norm(all.slice(i, i + 10).join(' '));
        // A palavra-chave da cláusula (piso, reajuste, vale) ou seus sinônimos decidem o trecho; os demais termos apenas desempatam.
        const chaveNaJanela = chaves.length > 0 && (chaves.some(t => window.includes(t)) || phrases.some(p => window.includes(p))) && (!cargo.length || cargo.some(t => window.includes(t)));
        const score = (chaveNaJanela ? 6 : 0) + terms.filter(t => !SYNONYMS[t] && window.includes(t)).length;
        if (chaves.length ? chaveNaJanela : score >= Math.min(4, terms.length * 2 || 2)) wins.push({ score, at: i });
      }
      // Os dois melhores trechos que não se sobrepõem (janelas de 14 linhas).
      const best: { score: number; at: number }[] = [];
      for (const w of wins.sort((a, b) => b.score - a.score)) if (best.length < 2 && best.every(b => Math.abs(b.at - w.at) >= 14)) best.push(w);
      best.sort((a, b) => a.at - b.at);
      // O trecho começa na primeira linha da janela que contém algum termo da pergunta.
      const excerpts = best.map(w => { const first = all.slice(w.at, w.at + 10).findIndex(l => terms.some(t => norm(l).includes(t))); const from = w.at + Math.max(0, first); return all.slice(from, from + 14).join(' ').replace(/\s+/g, ' ').trim().slice(0, 750); });
      if (excerpts.length) passages.push({ url: doc.url, title: doc.title, content: excerpts.join(' […] '), fetchedAt: doc.fetchedAt, pinned: true });
    }
    if (!passages.length) return { passages: [], semResposta: en
      ? `I could not confirm this in the collected agreements${cargo.length ? ' (I could not tie it to a category or job title)' : ''}. See [Collective documents](${SITE_URL}/convencoes-coletivas) or contact the SINDEPRESTEM legal sector: (11) 3215-8250.`
      : `Não consegui confirmar isso nas convenções coletadas${cargo.length ? ' (não identifiquei a categoria ou o cargo)' : ''}. Veja [Documentos coletivos](${SITE_URL}/convencoes-coletivas) ou fale com o Setor Jurídico do SINDEPRESTEM: (11) 3215-8250.` };
    return { passages };
  } catch { return { passages: [] }; } finally { db.close(); }
}

/**
 * Tudo o que a SINDI sabe de fontes estruturadas ou documentos longos, como trechos escolhidos pela pergunta: NR, Constituição e regimentos, cláusulas de convenção,
 * indicadores, posição do sindicato em artigos e notícias, e listas de documentos do sindicato. Os trechos vão ao modelo, nunca ao usuário: a SINDI explica, não copia.
 * `semResposta` é o aviso quando o documento pedido não consta da coleta. `lista` indica que há vários documentos curtos (mais trechos cabem na evidência).
 */
export function trechosDeDocumentos(question: string, terms: string[], language: string, file = dbPath()): TrechosDeDocumentos {
  const q = norm(question);
  const nr = nrPassages(question, language, file); if (nr.passages.length || nr.semResposta) return nr;
  const law = lawPassages(question, terms, language, file); if (law.passages.length || law.semResposta) return law;
  if (perguntaDeClausula(q)) return clausePassages(question, language, file);
  const indicadores = indicatorPassages(question, language, file); if (indicadores.length) return { passages: indicadores };
  const posicao = posicionamentoPassages(question, language, file); if (posicao.passages.length || posicao.semResposta) return posicao;
  const lista = sindicatoPassages(question, language, file); if (lista.length) return { passages: lista, lista: true };
  return { passages: [] };
}

const GENERICAS = new Set('sindicato sindeprestem posicionamento posicao opiniao presidente vander morales defende defendem pensa pensam acha acham visao qual quais sobre entidade diz dizem manifestou manifesta artigo artigos noticia noticias fala'.split(' '));
/**
 * "Qual o posicionamento do sindicato sobre X?": os artigos do presidente e as notícias do SINDEPRESTEM que tratam do tema, como trechos para o modelo
 * resumir a posição com palavras próprias, sempre com a fonte. Sem texto sobre o tema, devolve vazio e a SINDI não inventa posição.
 */
export function posicionamentoPassages(question: string, language: string, file = dbPath()): TrechosDeDocumentos {
  const q = norm(question); const en = language === 'en';
  if (!/posicionamento|posicao|opiniao|o que (o )?(sindicato|sindeprestem|presidente|vander).*(pensa|defende|acha|diz|fala)|qual a visao|o que defende|position on|stance|opinion on/.test(q) || !existsSync(file)) return { passages: [] };
  const words = [...new Set((q.match(/[a-z0-9]{3,}/g) ?? []).filter(w => !GENERICAS.has(w) && !STOP.has(w) && !/^(o|a|os|as|de|do|da|que|sobre|para|tem|ter)$/.test(w)))].slice(0, 6);
  if (!words.length) return { passages: [] };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare(`SELECT d.title, d.url, d.content, d.published_at, d.fetched_at AS fetchedAt, json_extract(d.meta, '$.section') AS section FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
      WHERE documents_fts MATCH ? AND d.source = 'sindeprestem' AND d.url LIKE '%/post/%' AND json_extract(d.meta, '$.section') IN ('artigo', 'noticia')
      ORDER BY (json_extract(d.meta, '$.section') = 'artigo') DESC, bm25(documents_fts, 6.0, 1.0) LIMIT 4`).all(words.map(w => `"${w}"*`).join(' AND ')) as { title: string; url: string; content: string; published_at: string | null; fetchedAt: string; section: string }[];
    if (!rows.length) return { passages: [], semResposta: en
      ? `I did not find articles or news from SINDEPRESTEM about "${words.join(' ')}" in the collected sources. See [Articles](${SITE_URL}/artigos) and [News](${SITE_URL}/noticias).`
      : `Não encontrei artigos ou notícias do SINDEPRESTEM sobre "${words.join(' ')}" nas fontes coletadas. Consulte [Artigos](${SITE_URL}/artigos) e [Notícias](${SITE_URL}/noticias).` };
    return { passages: rows.map(r => ({ url: r.url, title: r.title.replace(/^Artigo\s*[-–]\s*/i, ''), fetchedAt: r.fetchedAt, pinned: true as const,
      content: `${r.section === 'artigo' ? (en ? 'Article by the president' : 'Artigo do presidente') : (en ? 'News' : 'Notícia do sindicato')} de ${dateBr(r.published_at, language)}. ${trechosRelevantes(r.content.replace(/Por Vander Morales[^\n]*/g, ''), words, 600, 300).replace(/\s+/g, ' ')}` })) };
  } catch { return { passages: [] }; } finally { db.close(); }
}
