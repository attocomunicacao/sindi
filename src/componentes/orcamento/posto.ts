import { CATALOGO } from '@/componentes/orcamento/catalogo';

export type Posto = {
  chave: number;
  funcaoId: string;
  quantidade: number;
  turno: 'diurno' | 'noturno';
  periculosidade: boolean;
  insalubridade: 0 | 0.1 | 0.2 | 0.4;
  horasNoturnas: string;
};
export type Insumo = { categoria: string; id: string; quantidade: number };

let proximaChave = 1;

/** Um posto novo já traz os adicionais da função (o que está na tela é o que entra no cálculo). */
export function novoPosto(funcaoId: string, quantidade = 1, turno: Posto['turno'] = 'diurno'): Posto {
  const funcao = CATALOGO.funcoes.find((f) => f.id === funcaoId);
  return {
    chave: proximaChave++,
    funcaoId,
    quantidade,
    turno,
    periculosidade: (funcao?.periculosidade ?? 0) > 0,
    insalubridade: (funcao?.insalubridade ?? 0) as Posto['insalubridade'],
    horasNoturnas: '',
  };
}

/** Dois postos idênticos são recusados pelo servidor ao gerar o PDF: a tela avisa antes. */
export function temPostoRepetido(postos: Posto[]) {
  const vistos = new Set<string>();
  return postos.some((p) => {
    const identidade = JSON.stringify([p.funcaoId, p.turno, p.periculosidade, p.insalubridade, p.horasNoturnas]);
    if (vistos.has(identidade)) return true;
    vistos.add(identidade);
    return false;
  });
}
