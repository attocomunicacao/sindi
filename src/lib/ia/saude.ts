import { inteiro, type LlmError } from '@/lib/ia/tipos';

/**
 * Saúde de cada provedor, em memória do processo: um disjuntor (quem falhou fica de fora por um tempo) e contadores próprios de pedidos por minuto e por dia,
 * para pular um provedor **antes** de tomar o 429 quando o limite gratuito dele é conhecido. Nada aqui guarda pergunta, IP ou resposta: só contagens e horários.
 *
 * - `limite` (429/402): fora pelo tempo que o provedor informou; sem informação, 10 min.
 * - `configuracao` (chave/modelo errados): fora por 1 h (corrigir exige reiniciar o servidor de qualquer forma).
 * - `indisponivel` (erro, rede, tempo): fora por 60 s.
 * - Limites conhecidos: `SINDI_LIMITE_MINUTO_<ID>` e `SINDI_LIMITE_DIA_<ID>` (0 desliga). O dia dos provedores vira à meia-noite UTC.
 */
type Estado = {
  foraAte: number;
  motivo?: LlmError['tipo'];
  /** Falhas `indisponivel` seguidas, para o castigo crescer (recuo exponencial). */
  seguidas?: number;
  minuto: { inicio: number; usados: number };
  dia: { data: string; usados: number };
};
const estados = new Map<string, Estado>();

const PADROES: Record<string, { minuto: number; dia: number }> = {
  groq: { minuto: 30, dia: 1000 },
  mistral: { minuto: 60, dia: 0 },
};
// "0" desliga o limite; vazio ou inválido usa o padrão conhecido do provedor.
const lerLimite = (nome: string, padrao: number) => {
  const v = process.env[nome];
  return v === '0' ? 0 : inteiro(v, padrao, 1, 10_000_000);
};
const limites = (id: string) => {
  const padrao = PADROES[id] ?? { minuto: 0, dia: 0 };
  const chave = id.toUpperCase();
  return {
    minuto: lerLimite(`SINDI_LIMITE_MINUTO_${chave}`, padrao.minuto),
    dia: lerLimite(`SINDI_LIMITE_DIA_${chave}`, padrao.dia),
  };
};
const diaUtc = (agora: number) => new Date(agora).toISOString().slice(0, 10);

function estadoDe(id: string, agora: number): Estado {
  let e = estados.get(id);
  if (!e) {
    e = { foraAte: 0, minuto: { inicio: agora, usados: 0 }, dia: { data: diaUtc(agora), usados: 0 } };
    estados.set(id, e);
  }
  if (agora - e.minuto.inicio >= 60_000) e.minuto = { inicio: agora, usados: 0 };
  if (e.dia.data !== diaUtc(agora)) {
    e.dia = { data: diaUtc(agora), usados: 0 };
    if (e.motivo === 'limite') e.foraAte = 0;
  }
  return e;
}

/** O provedor pode ser tentado agora (fora do castigo e abaixo dos limites conhecidos)? */
export function podeTentar(id: string, agora = Date.now()) {
  const e = estadoDe(id, agora);
  const { minuto, dia } = limites(id);
  if (e.foraAte > agora) return false;
  if (minuto > 0 && e.minuto.usados >= minuto) return false;
  if (dia > 0 && e.dia.usados >= dia) return false;
  return true;
}
/** Conta uma tentativa (gasta limite do provedor mesmo que falhe). */
export function registrarTentativa(id: string, agora = Date.now()) {
  const e = estadoDe(id, agora);
  e.minuto.usados++;
  e.dia.usados++;
}
export function registrarSucesso(id: string, agora = Date.now()) {
  const e = estadoDe(id, agora);
  e.foraAte = 0;
  e.motivo = undefined;
  e.seguidas = 0;
}
/** Castigo máximo do modelo local: ele é a última saída, então um erro (ex.: modelo ainda não baixado) nunca o tira do ar por muito tempo. */
const CASTIGO_LOCAL_MAX_S = 30;
/** Recuo exponencial das falhas de disponibilidade: 60 s, 2 min, 4 min... até 15 min, para não reexperimentar a cada minuto um provedor instável. */
const castigoIndisponivel = (seguidas: number) => Math.min(60 * 2 ** Math.max(0, seguidas - 1), 900);

export function registrarFalha(id: string, erro: LlmError, agora = Date.now(), local = false) {
  const e = estadoDe(id, agora);
  if (erro.tipo === 'bloqueio') return; // recusa do pedido, não do provedor
  e.seguidas = erro.tipo === 'indisponivel' ? (e.seguidas ?? 0) + 1 : 0;
  let segundos =
    erro.tipo === 'limite'
      ? Math.min(erro.esperaSegundos ?? 600, 86_400)
      : erro.tipo === 'configuracao'
        ? 3600
        : castigoIndisponivel(e.seguidas);
  if (local) segundos = Math.min(segundos, CASTIGO_LOCAL_MAX_S);
  e.foraAte = agora + Math.max(1, segundos) * 1000;
  e.motivo = erro.tipo;
}
export function reiniciarSaude() {
  estados.clear();
}
