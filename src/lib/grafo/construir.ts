import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { ESTANTES, estanteDoDocumento } from '@/lib/biblioteca/estantes';
import { refDoDocumento } from '@/lib/biblioteca/consulta';
import { carregarArquivos, type TrechoDoCerebro } from '@/lib/cerebro/carregar';
import { conectores } from '@/lib/cerebro/conectores';
import { arquivoDeVetores, cosseno, idDoTrecho } from '@/lib/cerebro/embeddings';
import { normalizar } from '@/lib/base/texto';
import { caminhoDoBanco } from '@/lib/dados/db';
import { extrairEntidades } from '@/lib/grafo/entidades';
import type { Aresta, Grafo, No, TipoDeAresta, TipoDeNo } from '@/lib/grafo/tipos';

/**
 * Monta o grafo do cérebro a partir do que já existe — nada é inventado nem copiado:
 *  - núcleo → especialistas (os conectores de cerebro/conectores) → estantes que cada um consulta;
 *  - especialista ↔ conhecimento da equipe, quando compartilham gatilhos;
 *  - conhecimento ↔ conhecimento, quando são parecidos em significado (vetores já calculados para a busca, cosseno ≥ 0,8);
 *  - resumo automático (cerebro/auto) → documento que ele cita por link;
 *  - documento → estante em que está catalogado;
 *  - documento → documento, pelos links do próprio site;
 *  - documento → lei / NR / projeto de lei que ele cita (só padrões número/ano; entidade citada por um documento só fica se outro também a citar ou se for o próprio projeto).
 * As posições são calculadas aqui (d3-force), para a página só desenhar.
 */
type Linha = {
  rowid: number;
  url: string;
  source: string;
  title: string;
  published_at: string | null;
  meta: string | null;
  trecho: string;
};
const LIMITE_DE_TEXTO = 40_000;

export function construirGrafo(opcoes: { banco?: string; iteracoes?: number } = {}): Grafo {
  const nos = new Map<string, Omit<No, 'x' | 'y' | 'grau'>>();
  const arestas: Aresta[] = [];
  const vistas = new Set<string>();
  const no = (id: string, tipo: TipoDeNo, rotulo: string, grupo: string, extra: Partial<No> = {}) => {
    if (!nos.has(id))
      nos.set(id, { id, tipo, rotulo: rotulo.replace(/\s+/g, ' ').trim().slice(0, 140), grupo, ...extra });
    return id;
  };
  const liga = (de: string, para: string, tipo: TipoDeAresta, peso = 1) => {
    if (de === para || !nos.has(de) || !nos.has(para)) return;
    const chave = de < para ? `${de}|${para}|${tipo}` : `${para}|${de}|${tipo}`;
    if (vistas.has(chave)) return;
    vistas.add(chave);
    arestas.push({ de, para, tipo, peso });
  };

  // Núcleo, especialistas e estantes.
  const nucleo = no('sindi', 'nucleo', 'SINDI', 'nucleo', { href: '/' });
  for (const e of ESTANTES) no(`estante:${e.id}`, 'estante', e.nome, e.ala, { href: `/base/${e.id}` });
  const lista = conectores();
  for (const c of lista) {
    no(`conector:${c.id}`, 'conector', c.titulo, 'conector');
    liga(nucleo, `conector:${c.id}`, 'especialista', 3);
    for (const e of c.estantes) liga(`conector:${c.id}`, `estante:${e}`, 'consulta', 2);
  }

  // Conhecimento escrito pela equipe e resumos automáticos (um nó por arquivo do cérebro).
  const { trechos } = carregarArquivos();
  const porArquivo = new Map<string, TrechoDoCerebro[]>();
  for (const t of trechos) porArquivo.set(t.arquivo, [...(porArquivo.get(t.arquivo) ?? []), t]);
  for (const [arquivo, lista2] of porArquivo) {
    const id = no(
      `conhecimento:${arquivo}`,
      'conhecimento',
      lista2[0].titulo,
      arquivo.startsWith('auto/') ? 'auto' : 'curado',
      { href: '/base/cerebro' },
    );
    liga(id, 'estante:cerebro', 'guarda', 1);
    const gatilhos = new Set(lista2.flatMap((t) => t.gatilhos.map(normalizar)));
    for (const c of lista) {
      const comuns = c.gatilhos.filter((g) => gatilhos.has(g)).length;
      if (comuns) liga(`conector:${c.id}`, id, 'gatilho', Math.min(3, comuns));
    }
  }

  // Parecidos em significado (vetores da busca semântica, agregados por arquivo).
  try {
    const indice = JSON.parse(readFileSync(arquivoDeVetores(), 'utf8')) as {
      vetores: Record<string, { vetor: number[] }>;
    };
    const comVetor = trechos.flatMap((t) => {
      const v = indice.vetores[idDoTrecho(t)]?.vetor;
      return v ? [{ arquivo: t.arquivo, v }] : [];
    });
    const melhores = new Map<string, number>();
    for (let i = 0; i < comVetor.length; i++)
      for (let j = i + 1; j < comVetor.length; j++) {
        const a = comVetor[i];
        const b = comVetor[j];
        if (a.arquivo === b.arquivo) continue;
        const s = cosseno(a.v, b.v);
        if (s < 0.8) continue;
        const chave = a.arquivo < b.arquivo ? `${a.arquivo}|${b.arquivo}` : `${b.arquivo}|${a.arquivo}`;
        melhores.set(chave, Math.max(melhores.get(chave) ?? 0, s));
      }
    for (const [chave, s] of melhores) {
      const [a, b] = chave.split('|');
      liga(`conhecimento:${a}`, `conhecimento:${b}`, 'parecido', Math.round(s * 100) / 100);
    }
  } catch {
    /* sem índice de vetores: o grafo sai sem as ligações por significado */
  }

  // Documentos da biblioteca, entidades e links.
  const banco = opcoes.banco === undefined ? caminhoDoBanco() : opcoes.banco;
  const porUrl = new Map<string, string>();
  const citacoes = new Map<string, { rotulo: string; tipo: TipoDeNo; docs: Set<string>; proprio?: string }>();
  const linksDoSite: [string, string[]][] = [];
  if (banco && existsSync(banco)) {
    const db = new DatabaseSync(banco, { readOnly: true });
    try {
      const linhas = db
        .prepare(
          `SELECT rowid, url, source, title, published_at, meta, substr(content, 1, ${LIMITE_DE_TEXTO}) AS trecho FROM documents`,
        )
        .all() as Linha[];
      for (const l of linhas) {
        let meta: Record<string, unknown> = {};
        try {
          meta = l.meta ? JSON.parse(l.meta) : {};
        } catch {
          /* meta inválida: segue sem ela */
        }
        if (meta.listing) continue; // páginas de listagem do site não são documentos
        const estante = estanteDoDocumento({
          source: l.source,
          section: meta.section as string | undefined,
          kind: meta.kind as string | undefined,
          url: l.url,
        });
        const id = no(`doc:${refDoDocumento(l.url)}:${l.rowid}`, 'documento', l.title || l.url, l.source, {
          href: `/base/documento/${l.rowid}?r=${refDoDocumento(l.url)}`,
          data: l.published_at ?? undefined,
        });
        porUrl.set(l.url.split('#')[0].replace(/\/+$/, ''), id);
        porUrl.set(l.url, id);
        liga(id, `estante:${estante}`, 'guarda', 0.3);
        if (Array.isArray(meta.links)) linksDoSite.push([id, meta.links as string[]]);
        for (const e of extrairEntidades(`${l.title}\n${l.trecho}`)) {
          const c = citacoes.get(e.id) ?? { rotulo: e.rotulo, tipo: e.tipo as TipoDeNo, docs: new Set<string>() };
          c.docs.add(id);
          // O próprio projeto de lei (Câmara/Senado) é o documento da entidade.
          if (
            e.tipo === 'proposicao' &&
            (l.source === 'camara' || l.source === 'senado') &&
            normalizar(l.title).includes(normalizar(e.rotulo))
          )
            c.proprio = id;
          citacoes.set(e.id, c);
        }
      }
    } finally {
      db.close();
    }
  }
  for (const [id, c] of citacoes) {
    if (c.docs.size < 2 && !c.proprio) continue;
    no(`ent:${id}`, c.tipo, c.rotulo, c.tipo);
    for (const d of c.docs) liga(d, `ent:${id}`, 'cita', d === c.proprio ? 2 : 1);
  }
  // Links do site: os do menu e do rodapé aparecem em quase toda página (medido: 47 mil de 56 mil ligações apontavam para "Home", "Contato"...).
  // São navegação, não relação entre conteúdos: alvo linkado por mais de 5% das páginas (mínimo 20) fica de fora, e cada página leva no máximo 15 links.
  const resolvidos = linksDoSite.map(
    ([de, links]) =>
      [
        de,
        [
          ...new Set(
            links.map((l) => porUrl.get(l.replace(/\/+$/, ''))).filter((p): p is string => Boolean(p) && p !== de),
          ),
        ],
      ] as const,
  );
  const entrada = new Map<string, number>();
  for (const [, alvos] of resolvidos) for (const a of alvos) entrada.set(a, (entrada.get(a) ?? 0) + 1);
  const tetoDeNavegacao = Math.max(20, resolvidos.length * 0.05);
  for (const [de, alvos] of resolvidos)
    for (const para of alvos.filter((a) => (entrada.get(a) ?? 0) <= tetoDeNavegacao).slice(0, 15))
      liga(de, para, 'liga', 0.5);
  // Resumos automáticos citam documentos por link Markdown.
  for (const [arquivo, lista2] of porArquivo) {
    if (!arquivo.startsWith('auto/')) continue;
    for (const t of lista2)
      for (const m of t.texto.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
        const para = porUrl.get(m[1].split('#')[0].replace(/\/+$/, '')) ?? porUrl.get(m[1]);
        if (para) liga(`conhecimento:${arquivo}`, para, 'cita', 1);
      }
  }
  return dispor([...nos.values()], arestas, opcoes.iteracoes ?? 260);
}

let soDoCerebro: { em: number; grafo: Grafo } | undefined;
/** Grafo sem a biblioteca (só cérebro), para quando o arquivo completo ainda não foi gerado. Fica 5 min em memória. */
export function grafoSoDoCerebro(): Grafo {
  if (soDoCerebro && Date.now() - soDoCerebro.em < 300_000) return soDoCerebro.grafo;
  const grafo = construirGrafo({ banco: '', iteracoes: 200 });
  soDoCerebro = { em: Date.now(), grafo };
  return grafo;
}

/** Posições por simulação de forças: núcleo no centro, especialistas e estantes em volta, documentos agrupados em torno das estantes. */
function dispor(base: Omit<No, 'x' | 'y' | 'grau'>[], arestas: Aresta[], iteracoes: number): Grafo {
  type N = SimulationNodeDatum & { id: string; tipo: TipoDeNo };
  const grau = new Map<string, number>();
  for (const a of arestas) {
    grau.set(a.de, (grau.get(a.de) ?? 0) + 1);
    grau.set(a.para, (grau.get(a.para) ?? 0) + 1);
  }
  const sim: N[] = base.map((n, i) => ({
    id: n.id,
    tipo: n.tipo,
    ...(n.tipo === 'nucleo' ? { fx: 0, fy: 0 } : {}),
    x: Math.cos(i) * (50 + (i % 400)),
    y: Math.sin(i) * (50 + (i % 400)),
  }));
  const links: (SimulationLinkDatum<N> & { tipo: TipoDeAresta })[] = arestas.map((a) => ({
    source: a.de,
    target: a.para,
    tipo: a.tipo,
  }));
  const distancia: Record<TipoDeAresta, number> = {
    especialista: 220,
    consulta: 160,
    gatilho: 120,
    guarda: 70,
    cita: 40,
    liga: 50,
    parecido: 70,
    fluxo: 80,
  };
  const forca: Record<TipoDeAresta, number> = {
    especialista: 0.9,
    consulta: 0.6,
    gatilho: 0.3,
    guarda: 0.08,
    cita: 0.15,
    liga: 0.05,
    parecido: 0.3,
    fluxo: 0.5,
  };
  forceSimulation(sim)
    .force(
      'link',
      forceLink<N, (typeof links)[number]>(links)
        .id((d) => d.id)
        .distance((l) => distancia[l.tipo])
        .strength((l) => forca[l.tipo]),
    )
    .force(
      'charge',
      forceManyBody<N>()
        .strength((n) =>
          n.tipo === 'documento'
            ? -8
            : n.tipo === 'nucleo' || n.tipo === 'conector'
              ? -900
              : n.tipo === 'estante'
                ? -400
                : -160,
        )
        .theta(0.9)
        .distanceMax(900),
    )
    .force('x', forceX<N>(0).strength(0.015))
    .force('y', forceY<N>(0).strength(0.015))
    .force('center', forceCenter(0, 0))
    .stop()
    .tick(iteracoes);
  const posicao = new Map(sim.map((n) => [n.id, n]));
  const nos: No[] = base.map((n) => {
    const p = posicao.get(n.id)!;
    return {
      ...n,
      x: Math.round((p.x ?? 0) * 10) / 10,
      y: Math.round((p.y ?? 0) * 10) / 10,
      grau: grau.get(n.id) ?? 0,
    };
  });
  const resumo = Object.fromEntries(
    (
      ['nucleo', 'conector', 'estante', 'conhecimento', 'documento', 'lei', 'nr', 'proposicao', 'sistema'] as TipoDeNo[]
    ).map((t) => [t, nos.filter((n) => n.tipo === t).length]),
  ) as Grafo['resumo'];
  return { versao: 1, geradoEm: new Date().toISOString(), nos, arestas, resumo };
}
