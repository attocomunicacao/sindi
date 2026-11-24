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
type Estado = { foraAte: number; motivo?: LlmError['tipo']; minuto: { inicio: number; usados: number }; dia: { data: string; usados: number } };
const estados = new Map<string, Estado>();

const PADROES: Record<string, { minuto: number; dia: number }> = {
  groq: { minuto: 30, dia: 1000 },
  openrouter: { minuto: 20, dia: 50 },
  mistral: { minuto: 60, dia: 0 },
  cloudflare: { minuto: 300, dia: 300 },
};
// "0" desliga o limite; vazio ou inválido usa o padrão conhecido do provedor.
const lerLimite = (nome: string, padrao: number) => { const v = process.env[nome]; return v === '0' ? 0 : inteiro(v, padrao, 1, 10_000_000); };
const limites = (id: string) => {
  const padrao = PADROES[id] ?? { minuto: 0, dia: 0 }; const chave = id.toUpperCase();
  return { minuto: lerLimite(`SINDI_LIMITE_MINUTO_${chave}`, padrao.minuto), dia: lerLimite(`SINDI_LIMITE_DIA_${chave}`, padrao.dia) };
};
const diaUtc = (agora: number) => new Date(agora).toISOString().slice(0, 10);

function estadoDe(id: string, agora: number): Estado {
  let e = estados.get(id);
  if (!e) { e = { foraAte: 0, minuto: { inicio: agora, usados: 0 }, dia: { data: diaUtc(agora), usados: 0 } }; estados.set(id, e); }
  if (agora - e.minuto.inicio >= 60_000) e.minuto = { inicio: agora, usados: 0 };
  if (e.dia.data !== diaUtc(agora)) { e.dia = { data: diaUtc(agora), usados: 0 }; if (e.motivo === 'limite') e.foraAte = 0; }
  return e;
}

/** O provedor pode ser tentado agora (fora do castigo e abaixo dos limites conhecidos)? */
export function podeTentar(id: string, agora = Date.now()) {
  const e = estadoDe(id, agora); const { minuto, dia } = limites(id);
  if (e.foraAte > agora) return false;
  if (minuto > 0 && e.minuto.usados >= minuto) return false;
  if (dia > 0 && e.dia.usados >= dia) return false;
  return true;
}
/** Conta uma tentativa (gasta limite do provedor mesmo que falhe). */
export function registrarTentativa(id: string, agora = Date.now()) { const e = estadoDe(id, agora); e.minuto.usados++; e.dia.usados++; }
export function registrarSucesso(id: string, agora = Date.now()) { const e = estadoDe(id, agora); e.foraAte = 0; e.motivo = undefined; }
export function registrarFalha(id: string, erro: LlmError, agora = Date.now()) {
  const e = estadoDe(id, agora);
  if (erro.tipo === 'bloqueio') return; // recusa do pedido, não do provedor
  const segundos = erro.tipo === 'limite' ? Math.min(erro.esperaSegundos ?? 600, 86_400) : erro.tipo === 'configuracao' ? 3600 : 60;
  e.foraAte = agora + Math.max(1, segundos) * 1000; e.motivo = erro.tipo;
}
export function reiniciarSaude() { estados.clear(); }
