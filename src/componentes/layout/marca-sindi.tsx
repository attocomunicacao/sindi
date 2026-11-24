'use client';
import { useEffect, useState } from 'react';

/**
 * Marca da SINDI: um balão de conversa (a assistente) que guarda o glifo da página atual, como uma ferramenta que se troca.
 * Todos os glifos têm quatro elementos e ocupam a mesma caixa de 80×32 unidades (os de 56 de largura ficam centralizados), com ~11 de margem interna no balão:
 * início = as quatro figuras do logotipo; orçamento = moeda e barras; painel = quatro painéis; biblioteca = livros; uso = medidor.
 * Em toda troca (e na entrada) o glifo antigo cai e o novo sobe, com a mesma animação (globals.css, .sindi-mark). O balão é fixo, sem animação de contorno.
 */
import type { Pagina } from '@/lib/paginas';
export type { Pagina };

const INK = 'var(--color-slate-800)';
const RED = 'var(--color-brand-red)';
const GOLD = 'var(--color-amber-400)';
const TRILHA = 'var(--color-slate-300)';
const contorno = { fill: 'none', stroke: INK, strokeWidth: 1.4, strokeLinejoin: 'round' as const };

/**
 * Figuras do logotipo do SINDEPRESTEM, com a geometria extraída do arquivo oficial (public/brand/sindeprestem-logo.png, 1555 px): cabeça circular e corpo em degraus,
 * na ordem grafite, vermelho, dourado e só contorno. Coordenadas do logo; cada figura é reduzida para a caixa de 80×32 do balão. Os recortes dos pés diferem entre
 * as figuras porque são as áreas visíveis do desenho original (uma figura cobre parte da outra).
 */
const LOGO = [
  { cor: INK, cabeca: [125.3, 96.6], corpo: 'M71 226V481H15V581H173V400L358 585H532L173 226Z' },
  { cor: RED, cabeca: [480.8, 96.6], corpo: 'M435 233V486L533 585V401L720 587H887L533 233Z' },
  { cor: GOLD, cabeca: [836.3, 96.6], corpo: 'M791 237V489L890 587V404L1077 591H1244L891 237Z' },
  { cor: 'none', cabeca: [1191.8, 96.6], corpo: 'M1139 232V486L1243 590V403L1427 588H1553V489H1497L1243 232Z' },
] as const;
const ESCALA = 80 / 1538;
const DESLOCA_Y = (32 - 591 * ESCALA) / 2;
const figura = (i: number) => {
  const { cor, cabeca, corpo } = LOGO[i];
  const vazada = cor === 'none';
  // O traço do contorno é engrossado (22 unidades do logo) para continuar visível em tamanho pequeno.
  return (
    <g
      transform={`translate(0 ${DESLOCA_Y}) scale(${ESCALA}) translate(-15 0)`}
      fill={cor}
      stroke={vazada ? INK : cor}
      strokeWidth={vazada ? 22 : 2}
      strokeLinejoin="round"
    >
      <circle cx={cabeca[0]} cy={cabeca[1]} r={vazada ? 96.6 - 11 : 96.6} />
      <path d={corpo} />
    </g>
  );
};

const GLIFOS: Record<Pagina, React.ReactNode[]> = {
  inicio: [0, 1, 2, 3].map(figura),
  orcamento: [
    <circle key="m" cx="16" cy="16" r="16" fill={GOLD} />,
    <circle key="a" cx="16" cy="16" r="9.5" fill="none" stroke={INK} strokeWidth="2" />,
    <g key="b" fill={INK}>
      <rect x="36" y="18" width="5" height="14" />
      <rect x="43.5" y="9" width="5" height="23" fill={RED} />
    </g>,
    <rect key="c" x="51.7" y="0.7" width="3.6" height="30.6" {...contorno} />,
  ],
  painel: [
    <rect key="a" x="0" y="0" width="18" height="32" rx="2" fill={INK} />,
    <rect key="b" x="22" y="0" width="15" height="14" rx="2" fill={RED} />,
    <rect key="c" x="41" y="0" width="15" height="14" rx="2" fill={GOLD} />,
    <rect key="d" x="22.7" y="18.7" width="32.6" height="12.6" rx="2" {...contorno} />,
  ],
  base: [
    <rect key="a" x="0" y="2" width="10" height="30" fill={INK} />,
    <rect key="b" x="13" y="0" width="10" height="32" fill={RED} />,
    <rect key="c" x="26" y="6" width="10" height="26" fill={GOLD} />,
    <rect key="d" x="39.7" y="2.7" width="8.6" height="28.6" transform="rotate(14 40 32)" {...contorno} />,
  ],
  cerebro: [
    <g key="a" stroke={TRILHA} strokeWidth="1.6">
      <line x1="8" y1="24" x2="26" y2="8" />
      <line x1="26" y1="8" x2="46" y2="20" />
      <line x1="8" y1="24" x2="46" y2="20" />
    </g>,
    <circle key="b" cx="26" cy="8" r="7" fill={RED} />,
    <circle key="c" cx="8" cy="24" r="6" fill={GOLD} />,
    <circle key="d" cx="46" cy="20" r="6.6" {...contorno} />,
  ],
  tributos: [
    <rect key="a" x="0" y="4" width="22" height="28" rx="2" fill={INK} />,
    <g key="b" fill={GOLD}>
      <rect x="4" y="9" width="14" height="4" />
      <rect x="4" y="17" width="4" height="4" />
      <rect x="11" y="17" width="4" height="4" />
    </g>,
    <text key="c" x="28" y="26" fontSize="22" fontWeight="700" fill={RED}>
      %
    </text>,
    <circle key="d" cx="50" cy="12" r="5.3" {...contorno} />,
  ],
  danfse: [
    <rect key="a" x="0" y="0" width="26" height="32" rx="2" fill={INK} />,
    <rect key="b" x="4" y="6" width="18" height="3" fill={GOLD} />,
    <rect key="c" x="32" y="8" width="16" height="16" fill={RED} />,
    <rect key="d" x="35.7" y="11.7" width="8.6" height="8.6" {...contorno} />,
  ],
  custos: [
    <circle key="a" cx="10" cy="22" r="10" fill={GOLD} />,
    <circle key="b" cx="22" cy="12" r="10" fill={RED} />,
    <rect key="c" x="36" y="4" width="18" height="26" rx="2" fill={INK} />,
    <rect key="d" x="39.7" y="7.7" width="10.6" height="6.6" {...contorno} />,
  ],
  uso: [
    <path key="a" d="M3 32A25 25 0 0 1 53 32" fill="none" stroke={TRILHA} strokeWidth="6" />,
    <path key="b" d="M3 32A25 25 0 0 1 42.7 11.8" fill="none" stroke={GOLD} strokeWidth="6" />,
    <path key="c" d="M28 32L38.6 17.4" stroke={RED} strokeWidth="2.5" strokeLinecap="round" />,
    <circle key="d" cx="28" cy="32" r="4" fill={INK} />,
  ],
};

export function MarcaSindi({
  pagina = 'inicio',
  tamanho = 56,
  className = '',
}: {
  pagina?: Pagina;
  tamanho?: number;
  className?: string;
}) {
  const [exibida, setExibida] = useState<Pagina>(pagina);
  const saindo = pagina !== exibida;
  useEffect(() => {
    if (pagina === exibida) return;
    const espera = setTimeout(() => setExibida(pagina), 320);
    return () => clearTimeout(espera);
  }, [pagina, exibida]);
  return (
    <svg
      className={`sindi-mark ${className}`}
      width={(tamanho * 112) / 80}
      height={tamanho}
      viewBox="0 0 112 80"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path
        className="sm-bubble"
        d="M11 4H101A7 7 0 0 1 108 11V53A7 7 0 0 1 101 60H38L22 74V60H11A7 7 0 0 1 4 53V11A7 7 0 0 1 11 4Z"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <g transform={`translate(${exibida === 'inicio' ? 16 : 28} 16)`}>
        <g key={exibida} className={saindo ? 'sm-saindo' : ''}>
          {GLIFOS[exibida].map((elemento, i) => (
            <g key={i} className={`sm-fig sm-f${i + 1}`}>
              {elemento}
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
