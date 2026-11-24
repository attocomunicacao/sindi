// Sem dependências: a forma do cérebro é usada pelo servidor (que calcula as posições) e pelo navegador (que desenha a silhueta).
/**
 * O cérebro visto de cima, com a frente (lobo frontal) no alto: dois hemisférios (o esquerdo em azul, o direito em rosa) separados pela fissura
 * longitudinal. A SINDI fica no centro, na linha média, onde o corpo caloso liga os dois lados, orquestrando as áreas. As áreas de regras e
 * números (legislação, setor, custos) moram no hemisfério esquerdo; as de relação e mercado (comercial, RH, relacionamento), no direito.
 * Unidades do "mundo" do grafo: o cérebro cabe em cerca de 960 × 1.020.
 */
export type Lado = 'esquerdo' | 'direito';
export type Elipse = { cx: number; cy: number; rx: number; ry: number; giro: number; lado: Lado };

export const ELIPSES: readonly Elipse[] = [
  { cx: -242, cy: 20, rx: 236, ry: 485, giro: 0, lado: 'esquerdo' },
  { cx: 242, cy: 20, rx: 236, ry: 485, giro: 0, lado: 'direito' },
];

/**
 * Forma de cada hemisfério: uma superelipse (mais cheia que a elipse) com o lado de fora mais arredondado, o de dentro quase reto (os dois
 * hemisférios se encostam na fissura, como no cérebro visto de cima) e a parte de trás mais larga que a da frente (formato de ovo).
 */
const EXPOENTE_FORA = 2.3;
const EXPOENTE_DENTRO = 3.6;
const OVO = 0.12;
const sentidoDeFora = (e: Elipse) => (e.lado === 'esquerdo' ? -1 : 1);

/** O ponto está dentro da silhueta? `folga` < 1 encolhe a forma (margem para os nós não encostarem na borda). */
export function dentroDoCerebro(x: number, y: number, folga = 1) {
  return ELIPSES.some((e) => {
    const dx = x - e.cx;
    const dy = y - e.cy;
    const c = Math.cos(e.giro);
    const s = Math.sin(e.giro);
    const u = (dx * c + dy * s) / (e.rx * folga);
    const v = (-dx * s + dy * c) / (e.ry * folga);
    const fora = u * sentidoDeFora(e) > 0;
    const n = fora ? EXPOENTE_FORA : EXPOENTE_DENTRO;
    const uu = fora ? u / (1 + OVO * v) : u;
    return Math.abs(uu) ** n + Math.abs(v) ** n <= 1;
  });
}

/** Região do cérebro: onde ela fica, como se chama na anatomia e a cor do brilho. */
export type Regiao = { id: string; anatomia: string; x: number; y: number; cor: string; lado?: Lado };

/** Uma região por área (conector), pelo id do conector sem o número do arquivo. */
const REGIOES_POR_CONECTOR: Record<string, Omit<Regiao, 'id'>> = {
  'sobre-a-sindi-e-limites': { anatomia: 'Corpo caloso (linha média)', x: 0, y: -165, cor: '#ebb92e' },
  'legislacao-e-seguranca-juridica': {
    anatomia: 'Lobo frontal esquerdo',
    x: -250,
    y: -250,
    cor: '#38bdf8',
    lado: 'esquerdo',
  },
  'inteligencia-setorial-e-relatorios': {
    anatomia: 'Lobo parietal esquerdo',
    x: -270,
    y: 70,
    cor: '#22d3ee',
    lado: 'esquerdo',
  },
  'custos-tributacao-e-planejamento': {
    anatomia: 'Lobo occipital esquerdo',
    x: -225,
    y: 330,
    cor: '#60a5fa',
    lado: 'esquerdo',
  },
  'comercial-contratos-e-propostas': {
    anatomia: 'Lobo frontal direito',
    x: 250,
    y: -250,
    cor: '#f472b6',
    lado: 'direito',
  },
  'rh-recrutamento-e-qualificacao': {
    anatomia: 'Lobo parietal direito',
    x: 270,
    y: 70,
    cor: '#e879f9',
    lado: 'direito',
  },
  'relacionamento-com-o-sindeprestem': {
    anatomia: 'Lobo occipital direito',
    x: 225,
    y: 330,
    cor: '#fb7185',
    lado: 'direito',
  },
};
/** Lugares livres para uma área nova que ainda não tenha região própria acima (um em cada hemisfério). */
const REGIOES_RESERVA: Omit<Regiao, 'id'>[] = [
  { anatomia: 'Lobo temporal esquerdo', x: -330, y: 200, cor: '#7dd3fc', lado: 'esquerdo' },
  { anatomia: 'Lobo temporal direito', x: 330, y: 200, cor: '#f9a8d4', lado: 'direito' },
];
export const REGIAO_GERAL: Regiao = {
  id: 'geral',
  anatomia: 'Fissura longitudinal (biblioteca compartilhada)',
  x: 0,
  y: 190,
  cor: '#a5b4fc',
};
/** O centro do cérebro, onde fica a SINDI. */
export const CENTRO = { x: 0, y: 20 } as const;

/** Região de uma área; áreas fora da tabela usam um lugar de reserva, na ordem em que aparecem. */
export function regiaoDoConector(idDoConector: string, ordemDeReserva = 0): Regiao {
  const conhecida = REGIOES_POR_CONECTOR[idDoConector];
  if (conhecida) return { id: idDoConector, ...conhecida };
  const reserva = REGIOES_RESERVA[ordemDeReserva % REGIOES_RESERVA.length];
  return { id: idDoConector, ...reserva };
}

/** Todas as regiões conhecidas (as 7 áreas atuais mais a geral), para legenda e testes. */
export const todasAsRegioes = (): Regiao[] => [
  ...Object.entries(REGIOES_POR_CONECTOR).map(([id, r]) => ({ id, ...r })),
  REGIAO_GERAL,
];

/** Contorno ondulado de um hemisfério (as dobras do córtex): pontos em volta, com a borda variando poucos por cento do raio. */
export function contornoOndulado(e: Elipse, passos = 320, amplitude = 0.022): [number, number][] {
  const pontos: [number, number][] = [];
  const c = Math.cos(e.giro);
  const s = Math.sin(e.giro);
  const fase = e.lado === 'esquerdo' ? 0 : 1.7;
  for (let i = 0; i < passos; i++) {
    const t = (i / passos) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const fora = ct * sentidoDeFora(e) > 0;
    const n = fora ? EXPOENTE_FORA : EXPOENTE_DENTRO;
    const v = Math.sign(st) * Math.abs(st) ** (2 / n);
    let u = Math.sign(ct) * Math.abs(ct) ** (2 / n);
    if (fora) u *= 1 + OVO * v;
    // A fissura (lado de dentro) fica lisa; só o lado de fora tem as ondas do córtex.
    const onda = fora
      ? 1 +
        amplitude * Math.sin(9 * t + fase) +
        amplitude * 0.7 * Math.sin(15 * t + 2 * fase) +
        amplitude * 0.3 * Math.sin(23 * t)
      : 1;
    const x = u * e.rx * onda;
    const y = v * e.ry * onda;
    pontos.push([e.cx + x * c - y * s, e.cy + x * s + y * c]);
  }
  return pontos;
}
