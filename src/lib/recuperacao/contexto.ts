import type { Passagem } from '@/lib/base/tipos';
import { normalizar, termosDaConsulta } from '@/lib/base/texto';

export function evidenciaSuficiente(passagens: Passagem[], pergunta: string) {
  const termos = termosDaConsulta(pergunta);
  if (passagens.some((p) => p.pinned)) return true;
  if (!termos.length || !passagens.length) return false;
  const texto = normalizar(passagens.map((p) => `${p.title}\n${p.content}`).join('\n'));
  return termos.filter((t) => texto.includes(t)).length / termos.length >= 0.7;
}
