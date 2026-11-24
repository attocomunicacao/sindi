// Sem dependências: roda no navegador (a página) e nos testes. As respostas nunca saem daqui: não há rede, rota nem armazenamento.
import { PERGUNTAS, TEMAS, type IdDoTema, type Pergunta } from '@/lib/diagnostico/perguntas';

export type Resposta = 'sim' | 'parcial' | 'nao' | 'nao-sei' | 'nao-se-aplica';
export type Semaforo = 'verde' | 'amarelo' | 'vermelho';

export const OPCOES: readonly { valor: Resposta; rotulo: string }[] = [
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'parcial', rotulo: 'Em parte' },
  { valor: 'nao', rotulo: 'Não' },
  { valor: 'nao-sei', rotulo: 'Não sei' },
  { valor: 'nao-se-aplica', rotulo: 'Não se aplica' },
];

/**
 * Pontos de exposição por resposta: sim = 0, em parte = 1, não = 2, não sei = 2 (quem não sabe responder ainda não tem controle sobre o
 * tema) e "não se aplica" = 0 (o tema não existe para a empresa). Regra simples de propósito: dá para refazer a conta de cabeça.
 */
export const PONTOS: Record<Resposta, number> = { sim: 0, parcial: 1, nao: 2, 'nao-sei': 2, 'nao-se-aplica': 0 };
export const PONTOS_POR_PERGUNTA = 2;

/**
 * Limiares fixos, na proporção do máximo (cada pergunta vale até 2 pontos): verde até 1/6 do máximo, amarelo até 1/2, vermelho acima.
 * Por tema (3 perguntas, máximo 6): verde 0 a 1, amarelo 2 a 3, vermelho 4 a 6. No geral (15 perguntas, máximo 30): verde 0 a 5,
 * amarelo 6 a 15, vermelho 16 a 30. Um único "não" já deixa o tema em amarelo; só dois "não" ou mais o levam ao vermelho.
 */
export const LIMIARES = {
  tema: { verdeAte: 1, amareloAte: 3 },
  geral: { verdeAte: 5, amareloAte: 15 },
} as const;

export const semaforoDe = (pontos: number, l: { verdeAte: number; amareloAte: number }): Semaforo =>
  pontos <= l.verdeAte ? 'verde' : pontos <= l.amareloAte ? 'amarelo' : 'vermelho';

export type Respostas = Partial<Record<string, Resposta>>;

export type ResultadoDoTema = {
  id: IdDoTema;
  rotulo: string;
  pontos: number;
  maximo: number;
  semaforo: Semaforo;
};

export type ItemDoPlano = {
  perguntaId: string;
  tema: IdDoTema;
  /** Verdadeiro quando a resposta foi "não sei": o plano pede primeiro para descobrir a situação. */
  porDesconhecimento: boolean;
  pontos: number;
  acao: string;
  pergunta: Pergunta;
};

export type Diagnostico = {
  temas: ResultadoDoTema[];
  geral: { pontos: number; maximo: number; semaforo: Semaforo };
  /** Só o que tem pontos, dos mais urgentes (2) aos menos (1); dentro do mesmo peso, na ordem das perguntas. */
  plano: ItemDoPlano[];
};

const valida = (r: unknown): r is Resposta => typeof r === 'string' && Object.hasOwn(PONTOS, r);

/** Quantas perguntas ainda não têm resposta válida. */
export const faltam = (respostas: Respostas): number => PERGUNTAS.filter((p) => !valida(respostas[p.id])).length;

/** Calcula o semáforo e o plano. Devolve `undefined` enquanto houver pergunta sem resposta: resultado parcial enganaria. */
export function diagnosticar(respostas: Respostas): Diagnostico | undefined {
  if (faltam(respostas) > 0) return undefined;
  const pontosDe = (p: Pergunta) => PONTOS[respostas[p.id] as Resposta];
  const temas = TEMAS.map((t): ResultadoDoTema => {
    const doTema = PERGUNTAS.filter((p) => p.tema === t.id);
    const pontos = doTema.reduce((s, p) => s + pontosDe(p), 0);
    return {
      id: t.id,
      rotulo: t.rotulo,
      pontos,
      maximo: doTema.length * PONTOS_POR_PERGUNTA,
      semaforo: semaforoDe(pontos, LIMIARES.tema),
    };
  });
  const pontos = PERGUNTAS.reduce((s, p) => s + pontosDe(p), 0);
  const plano = PERGUNTAS.map((pergunta, i) => ({ pergunta, i, pontos: pontosDe(pergunta) }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.i - b.i)
    .map(({ pergunta, pontos: n }): ItemDoPlano => ({
      perguntaId: pergunta.id,
      tema: pergunta.tema,
      porDesconhecimento: respostas[pergunta.id] === 'nao-sei',
      pontos: n,
      acao: pergunta.acao,
      pergunta,
    }));
  return {
    temas,
    geral: {
      pontos,
      maximo: PERGUNTAS.length * PONTOS_POR_PERGUNTA,
      semaforo: semaforoDe(pontos, LIMIARES.geral),
    },
    plano,
  };
}

/** Texto do semáforo para quem não distingue cores e para o leitor de tela: a cor nunca é a única pista. */
export const TEXTO_DO_SEMAFORO: Record<Semaforo, { rotulo: string; leitura: string }> = {
  verde: { rotulo: 'Verde', leitura: 'nenhuma pendência apontada pelas suas respostas' },
  amarelo: { rotulo: 'Amarelo', leitura: 'atenção: há pontos a conferir' },
  vermelho: { rotulo: 'Vermelho', leitura: 'prioridade: vários pontos a resolver' },
};
