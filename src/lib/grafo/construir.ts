import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  forceCollide,
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
import { CENTRO, dentroDoCerebro, REGIAO_GERAL, regiaoDoConector, type Regiao } from '@/lib/grafo/cerebro-forma';
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

type DadosDoNo = Omit<No, 'x' | 'y' | 'grau'>;
/** Os nós e as arestas em construção, com as duas operações que toda etapa usa: criar um nó (uma vez por id) e ligar dois nós (uma vez por par e tipo). */
type Montador = {
  nos: Map<string, DadosDoNo>;
  arestas: Aresta[];
  no: (id: string, tipo: TipoDeNo, rotulo: string, grupo: string, extra?: Partial<No>) => string;
  liga: (de: string, para: string, tipo: TipoDeAresta, peso?: number) => void;
};
type Citacao = { rotulo: string; tipo: TipoDeNo; docs: Set<string>; proprio?: string };
type Conector = ReturnType<typeof conectores>[number];

function criarMontador(): Montador {
  const nos = new Map<string, DadosDoNo>();
  const arestas: Aresta[] = [];
  const vistas = new Set<string>();
  const no: Montador['no'] = (id, tipo, rotulo, grupo, extra = {}) => {
    if (!nos.has(id))
      nos.set(id, { id, tipo, rotulo: rotulo.replace(/\s+/g, ' ').trim().slice(0, 140), grupo, ...extra });
    return id;
  };
  const liga: Montador['liga'] = (de, para, tipo, peso = 1) => {
    if (de === para || !nos.has(de) || !nos.has(para)) return;
    const chave = de < para ? `${de}|${para}|${tipo}` : `${para}|${de}|${tipo}`;
    if (vistas.has(chave)) return;
    vistas.add(chave);
    arestas.push({ de, para, tipo, peso });
  };
  return { nos, arestas, no, liga };
}

/** Núcleo, especialistas (conectores) e estantes que cada um consulta. */
function ligarNucleo({ no, liga }: Montador, lista: Conector[]) {
  const nucleo = no('sindi', 'nucleo', 'SINDI', 'nucleo', { href: '/' });
  for (const e of ESTANTES) no(`estante:${e.id}`, 'estante', e.nome, e.ala, { href: `/base/${e.id}` });
  for (const c of lista) {
    no(`conector:${c.id}`, 'conector', c.titulo, 'conector');
    liga(nucleo, `conector:${c.id}`, 'especialista', 3);
    for (const e of c.estantes) liga(`conector:${c.id}`, `estante:${e}`, 'consulta', 2);
  }
}

function agruparPorArquivo(trechos: TrechoDoCerebro[]): Map<string, TrechoDoCerebro[]> {
  const porArquivo = new Map<string, TrechoDoCerebro[]>();
  for (const t of trechos) porArquivo.set(t.arquivo, [...(porArquivo.get(t.arquivo) ?? []), t]);
  return porArquivo;
}

/** Conhecimento escrito pela equipe e resumos automáticos (um nó por arquivo do cérebro), ligados aos especialistas com gatilhos em comum. */
function ligarConhecimento({ no, liga }: Montador, porArquivo: Map<string, TrechoDoCerebro[]>, lista: Conector[]) {
  for (const [arquivo, trechosDoArquivo] of porArquivo) {
    const id = no(
      `conhecimento:${arquivo}`,
      'conhecimento',
      trechosDoArquivo[0].titulo,
      arquivo.startsWith('auto/') ? 'auto' : 'curado',
      { href: '/base/cerebro' },
    );
    liga(id, 'estante:cerebro', 'guarda', 1);
    const gatilhos = new Set(trechosDoArquivo.flatMap((t) => t.gatilhos.map(normalizar)));
    for (const c of lista) {
      const comuns = c.gatilhos.filter((g) => gatilhos.has(g)).length;
      if (comuns) liga(`conector:${c.id}`, id, 'gatilho', Math.min(3, comuns));
    }
  }
}

/** Parecidos em significado (vetores da busca semântica, agregados por arquivo): fica o maior cosseno de cada par de arquivos. */
function ligarParecidos({ liga }: Montador, trechos: TrechoDoCerebro[]) {
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
}

function lerMeta(texto: string | null): Record<string, unknown> {
  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    return {}; // meta inválida: segue sem ela
  }
}

/** Registra as entidades (lei, NR, projeto) citadas por um documento; o próprio projeto de lei (Câmara/Senado) é o documento da entidade. */
function registrarCitacoes(citacoes: Map<string, Citacao>, l: Linha, idDoDocumento: string) {
  for (const e of extrairEntidades(`${l.title}\n${l.trecho}`)) {
    const c = citacoes.get(e.id) ?? { rotulo: e.rotulo, tipo: e.tipo as TipoDeNo, docs: new Set<string>() };
    c.docs.add(idDoDocumento);
    if (
      e.tipo === 'proposicao' &&
      (l.source === 'camara' || l.source === 'senado') &&
      normalizar(l.title).includes(normalizar(e.rotulo))
    )
      c.proprio = idDoDocumento;
    citacoes.set(e.id, c);
  }
}

/** Documentos da biblioteca (um nó cada, ligado à estante), com o que as etapas seguintes precisam: URL → nó, entidades citadas e links do site. */
function lerDocumentos({ no, liga }: Montador, banco: string | undefined) {
  const porUrl = new Map<string, string>();
  const citacoes = new Map<string, Citacao>();
  const linksDoSite: [string, string[]][] = [];
  if (!banco || !existsSync(banco)) return { porUrl, citacoes, linksDoSite };
  const db = new DatabaseSync(banco, { readOnly: true });
  try {
    const linhas = db
      .prepare(
        `SELECT rowid, url, source, title, published_at, meta, substr(content, 1, ${LIMITE_DE_TEXTO}) AS trecho FROM documents`,
      )
      .all() as Linha[];
    for (const l of linhas) {
      const meta = lerMeta(l.meta);
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
      registrarCitacoes(citacoes, l, id);
    }
  } finally {
    db.close();
  }
  return { porUrl, citacoes, linksDoSite };
}

/** Entidade citada por um documento só vira nó se outro também a citar ou se for o próprio projeto. */
function ligarEntidades({ no, liga }: Montador, citacoes: Map<string, Citacao>) {
  for (const [id, c] of citacoes) {
    if (c.docs.size < 2 && !c.proprio) continue;
    no(`ent:${id}`, c.tipo, c.rotulo, c.tipo);
    for (const d of c.docs) liga(d, `ent:${id}`, 'cita', d === c.proprio ? 2 : 1);
  }
}

/**
 * Links do site: os do menu e do rodapé aparecem em quase toda página (medido: 47 mil de 56 mil ligações apontavam para "Home", "Contato"...).
 * São navegação, não relação entre conteúdos: alvo linkado por mais de 5% das páginas (mínimo 20) fica de fora, e cada página leva no máximo 15 links.
 */
function ligarLinksDoSite({ liga }: Montador, linksDoSite: [string, string[]][], porUrl: Map<string, string>) {
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
}

/** Resumos automáticos citam documentos por link Markdown. */
function ligarResumosAosDocumentos(
  { liga }: Montador,
  porArquivo: Map<string, TrechoDoCerebro[]>,
  porUrl: Map<string, string>,
) {
  for (const [arquivo, trechosDoArquivo] of porArquivo) {
    if (!arquivo.startsWith('auto/')) continue;
    for (const t of trechosDoArquivo)
      for (const m of t.texto.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
        const para = porUrl.get(m[1].split('#')[0].replace(/\/+$/, '')) ?? porUrl.get(m[1]);
        if (para) liga(`conhecimento:${arquivo}`, para, 'cita', 1);
      }
  }
}

export function construirGrafo(opcoes: { banco?: string; iteracoes?: number } = {}): Grafo {
  const m = criarMontador();
  const lista = conectores();
  ligarNucleo(m, lista);
  const { trechos } = carregarArquivos();
  const porArquivo = agruparPorArquivo(trechos);
  ligarConhecimento(m, porArquivo, lista);
  ligarParecidos(m, trechos);
  const { porUrl, citacoes, linksDoSite } = lerDocumentos(
    m,
    opcoes.banco === undefined ? caminhoDoBanco() : opcoes.banco,
  );
  ligarEntidades(m, citacoes);
  ligarLinksDoSite(m, linksDoSite, porUrl);
  ligarResumosAosDocumentos(m, porArquivo, porUrl);
  classificar(m, lista);
  return dispor([...m.nos.values()], m.arestas, opcoes.iteracoes ?? 260);
}

let soDoCerebro: { em: number; grafo: Grafo } | undefined;
/** Grafo sem a biblioteca (só cérebro), para quando o arquivo completo ainda não foi gerado. Fica 5 min em memória. */
export function grafoSoDoCerebro(): Grafo {
  if (soDoCerebro && Date.now() - soDoCerebro.em < 300_000) return soDoCerebro.grafo;
  const grafo = construirGrafo({ banco: '', iteracoes: 200 });
  soDoCerebro = { em: Date.now(), grafo };
  return grafo;
}

/** O id do conector sem o prefixo do nó: é a chave da região dele no cérebro. */
const idDaArea = (idDoNo: string) => idDoNo.replace(/^conector:/, '');
/** Estante que nenhuma área consulta mora na área mais parecida com a ala dela (leis → legislação, setor → inteligência setorial, e assim por diante). */
const AREA_DA_ALA: Record<string, string> = {
  legislacao: 'legislacao-e-seguranca-juridica',
  setor: 'inteligencia-setorial-e-relatorios',
  sindicato: 'relacionamento-com-o-sindeprestem',
  sindi: 'sobre-a-sindi-e-limites',
};

/**
 * Dá a cada nó a sua região e o seu nível, para o cérebro fazer sentido: a estante mora na área que a consulta, o documento na estante em que está
 * catalogado, o conhecimento na área com que mais compartilha gatilhos e a lei/NR/projeto na região onde mais é citada. Também liga cada estante às
 * entidades que os documentos dela citam (as três maiores), para a rede continuar ligada quando os documentos estão recolhidos na tela.
 */
function classificar({ nos, arestas, liga }: Montador, lista: Conector[]) {
  const regiaoDe = new Map<string, string>([['sindi', 'sindi']]);
  for (const c of lista) regiaoDe.set(`conector:${c.id}`, c.id);
  // Estante: uma só área que a consulta → mora nela; várias (biblioteca compartilhada) → região geral, no meio das áreas; nenhuma → pela ala.
  const consultores = new Map<string, string[]>();
  for (const c of lista) for (const e of c.estantes) consultores.set(e, [...(consultores.get(e) ?? []), c.id]);
  const idsDasAreas = new Set(lista.map((c) => c.id));
  for (const n of nos.values()) {
    if (n.tipo !== 'estante') continue;
    const areas = consultores.get(n.id.replace(/^estante:/, '')) ?? [];
    const areaDaAla = AREA_DA_ALA[n.grupo];
    regiaoDe.set(
      n.id,
      areas.length === 1
        ? areas[0]
        : areas.length > 1
          ? REGIAO_GERAL.id
          : idsDasAreas.has(areaDaAla)
            ? areaDaAla
            : REGIAO_GERAL.id,
    );
  }
  // Conhecimento: a área com mais peso de gatilhos em comum.
  const melhorArea = new Map<string, { area: string; peso: number }>();
  for (const a of arestas) {
    if (a.tipo !== 'gatilho') continue;
    const atual = melhorArea.get(a.para);
    if (!atual || a.peso > atual.peso) melhorArea.set(a.para, { area: idDaArea(a.de), peso: a.peso });
  }
  for (const n of nos.values())
    if (n.tipo === 'conhecimento') regiaoDe.set(n.id, melhorArea.get(n.id)?.area ?? REGIAO_GERAL.id);
  // Documento → estante (aresta `guarda`); o documento herda a região da estante.
  const paiDoDocumento = new Map<string, string>();
  for (const a of arestas) if (a.tipo === 'guarda' && a.de.startsWith('doc:')) paiDoDocumento.set(a.de, a.para);
  for (const [doc, estante] of paiDoDocumento) {
    nos.get(doc)!.pai = estante;
    regiaoDe.set(doc, regiaoDe.get(estante) ?? REGIAO_GERAL.id);
  }
  // Entidade: a região mais frequente entre os documentos que a citam, e as estantes que mais a citam.
  const porRegiao = new Map<string, Map<string, number>>();
  const porEstante = new Map<string, Map<string, number>>();
  const contar = (m: Map<string, Map<string, number>>, chave: string, valor: string) => {
    const t = m.get(chave) ?? m.set(chave, new Map()).get(chave)!;
    t.set(valor, (t.get(valor) ?? 0) + 1);
  };
  for (const a of arestas) {
    if (a.tipo !== 'cita' || !a.de.startsWith('doc:') || !a.para.startsWith('ent:')) continue;
    contar(porRegiao, a.para, regiaoDe.get(a.de) ?? REGIAO_GERAL.id);
    const estante = paiDoDocumento.get(a.de);
    if (estante) contar(porEstante, a.para, estante);
  }
  const maior = (t?: Map<string, number>) => [...(t ?? [])].sort((x, y) => y[1] - x[1]);
  for (const n of nos.values())
    if (n.tipo === 'lei' || n.tipo === 'nr' || n.tipo === 'proposicao')
      regiaoDe.set(n.id, maior(porRegiao.get(n.id))[0]?.[0] ?? REGIAO_GERAL.id);
  for (const [entidade, porEst] of porEstante)
    for (const [estante, quantos] of maior(porEst).slice(0, 3)) liga(estante, entidade, 'cita', quantos);
  const NIVEL: Record<TipoDeNo, number> = {
    nucleo: 0,
    conector: 1,
    estante: 2,
    conhecimento: 2,
    lei: 3,
    nr: 3,
    proposicao: 3,
    documento: 4,
    sistema: 2,
  };
  for (const n of nos.values()) {
    n.regiao = regiaoDe.get(n.id) ?? REGIAO_GERAL.id;
    n.nivel = NIVEL[n.tipo];
  }
}

type NoSimulado = SimulationNodeDatum & {
  id: string;
  tipo: TipoDeNo;
  regiao: string;
  alvoX: number;
  alvoY: number;
};
const ANGULO_AUREO = 2.399963229728653;

/** Âncora de cada região no mundo do cérebro: as áreas conhecidas, a geral e o centro da SINDI. */
function ancorasDasRegioes(base: Omit<No, 'x' | 'y' | 'grau'>[]): Map<string, Regiao> {
  const mapa = new Map<string, Regiao>([
    [REGIAO_GERAL.id, REGIAO_GERAL],
    ['sindi', { id: 'sindi', anatomia: 'Tálamo', ...CENTRO, cor: '#f59e0b' }],
  ]);
  let reserva = 0;
  for (const n of base) if (n.tipo === 'conector') mapa.set(n.regiao!, regiaoDoConector(n.regiao!, reserva++));
  return mapa;
}

/**
 * Espalha os documentos de uma estante em espiral de girassol em volta dela (determinístico), com raio proporcional à raiz da quantidade: cada
 * estante vira uma nuvem de pontos, e o navegador só a mostra quando o documento é pedido.
 */
function espalharDocumentos(estante: readonly [number, number], quantidade: number, indice: number) {
  const raioTotal = Math.min(150, 22 + 3 * Math.sqrt(quantidade));
  const raio = raioTotal * Math.sqrt((indice + 0.5) / quantidade);
  const angulo = indice * ANGULO_AUREO;
  return [estante[0] + Math.cos(angulo) * raio, estante[1] + Math.sin(angulo) * raio] as const;
}

/**
 * Posições do cérebro: a SINDI no centro, cada área fixa na sua região, estantes, conhecimento e leis puxados para a região deles dentro da silhueta
 * (força de contenção) e os documentos em nuvem em volta da estante. Só a rede pequena (cerca de 330 nós) passa por simulação de forças.
 */
function dispor(base: Omit<No, 'x' | 'y' | 'grau'>[], arestas: Aresta[], iteracoes: number): Grafo {
  const grau = new Map<string, number>();
  for (const a of arestas) {
    grau.set(a.de, (grau.get(a.de) ?? 0) + 1);
    grau.set(a.para, (grau.get(a.para) ?? 0) + 1);
  }
  const regioes = ancorasDasRegioes(base);
  const ancora = (regiao: string | undefined) => regioes.get(regiao ?? '') ?? REGIAO_GERAL;
  const consultadaPor = new Map<string, string[]>();
  for (const a of arestas)
    if (a.tipo === 'consulta') consultadaPor.set(a.para, [...(consultadaPor.get(a.para) ?? []), idDaArea(a.de)]);
  const media = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  const rede: NoSimulado[] = [];
  const contadorPorRegiao = new Map<string, number>();
  for (const n of base) {
    if (n.tipo === 'documento') continue;
    const a = ancora(n.regiao);
    const i = contadorPorRegiao.get(n.regiao ?? '') ?? 0;
    contadorPorRegiao.set(n.regiao ?? '', i + 1);
    const angulo = i * ANGULO_AUREO;
    const raio = n.tipo === 'estante' ? 95 : 40 + 14 * Math.sqrt(i);
    const fixo = n.tipo === 'nucleo' ? CENTRO : n.tipo === 'conector' ? a : undefined;
    // Estante compartilhada: o alvo é o centro das áreas que a consultam.
    const donas = n.tipo === 'estante' ? (consultadaPor.get(n.id) ?? []).map((c) => ancora(c)) : [];
    const alvo = donas.length > 1 ? { x: media(donas.map((d) => d.x)), y: media(donas.map((d) => d.y)) } : a;
    rede.push({
      id: n.id,
      tipo: n.tipo,
      regiao: n.regiao ?? REGIAO_GERAL.id,
      alvoX: alvo.x,
      alvoY: alvo.y,
      x: fixo ? fixo.x : alvo.x + Math.cos(angulo) * raio,
      y: fixo ? fixo.y : alvo.y + Math.sin(angulo) * raio,
      ...(fixo ? { fx: fixo.x, fy: fixo.y } : {}),
    });
  }
  const ids = new Set(rede.map((n) => n.id));
  const links: (SimulationLinkDatum<NoSimulado> & { tipo: TipoDeAresta })[] = arestas
    .filter((a) => ids.has(a.de) && ids.has(a.para))
    .map((a) => ({ source: a.de, target: a.para, tipo: a.tipo }));
  const distancia: Partial<Record<TipoDeAresta, number>> = {
    especialista: 200,
    consulta: 110,
    gatilho: 90,
    parecido: 60,
    cita: 70,
  };
  const raioDeColisao = (t: TipoDeNo) => (t === 'estante' ? 34 : t === 'conector' ? 40 : t === 'nucleo' ? 44 : 11);
  // Contenção: quem saiu da silhueta (com margem) é puxado de volta para a âncora da própria região.
  const conter = (alfa: number) => {
    for (const n of rede) {
      if (n.fx != null || dentroDoCerebro(n.x ?? 0, n.y ?? 0, 0.9)) continue;
      n.vx = (n.vx ?? 0) + (n.alvoX - (n.x ?? 0)) * 0.25 * alfa;
      n.vy = (n.vy ?? 0) + (n.alvoY - (n.y ?? 0)) * 0.25 * alfa;
    }
  };
  forceSimulation(rede)
    .force(
      'link',
      forceLink<NoSimulado, (typeof links)[number]>(links)
        .id((d) => d.id)
        .distance((l) => distancia[l.tipo] ?? 80)
        .strength(0.25),
    )
    .force('charge', forceManyBody<NoSimulado>().strength(-60).distanceMax(260))
    .force('collide', forceCollide<NoSimulado>((n) => raioDeColisao(n.tipo)).strength(0.9))
    .force('x', forceX<NoSimulado>((n) => n.alvoX).strength(0.07))
    .force('y', forceY<NoSimulado>((n) => n.alvoY).strength(0.07))
    .force('contencao', conter)
    .stop()
    .tick(iteracoes);
  const posicao = new Map<string, readonly [number, number]>(rede.map((n) => [n.id, [n.x ?? 0, n.y ?? 0] as const]));
  // Documentos: nuvem em volta da estante, na ordem em que aparecem.
  const quantos = new Map<string, number>();
  for (const n of base) if (n.pai) quantos.set(n.pai, (quantos.get(n.pai) ?? 0) + 1);
  const visto = new Map<string, number>();
  for (const n of base) {
    if (n.tipo !== 'documento') continue;
    const a = ancora(n.regiao);
    const estante = posicao.get(n.pai ?? '') ?? ([a.x, a.y] as const);
    const i = visto.get(n.pai ?? '') ?? 0;
    visto.set(n.pai ?? '', i + 1);
    posicao.set(n.id, espalharDocumentos(estante, quantos.get(n.pai ?? '') ?? 1, i));
  }
  const nos: No[] = base.map((n) => {
    const [x, y] = posicao.get(n.id) ?? [0, 0];
    return { ...n, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, grau: grau.get(n.id) ?? 0 };
  });
  const resumo = Object.fromEntries(
    (
      ['nucleo', 'conector', 'estante', 'conhecimento', 'documento', 'lei', 'nr', 'proposicao', 'sistema'] as TipoDeNo[]
    ).map((t) => [t, nos.filter((n) => n.tipo === t).length]),
  ) as Grafo['resumo'];
  return { versao: 1, geradoEm: new Date().toISOString(), nos, arestas, resumo };
}
