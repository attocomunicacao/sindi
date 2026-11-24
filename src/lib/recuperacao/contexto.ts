import type { Passagem } from '@/lib/base/tipos';
import { normalizar, termosDaConsulta } from '@/lib/base/texto';

export function evidenciaSuficiente(passages: Passagem[], question: string) {
  const terms = termosDaConsulta(question);
  if (passages.some(p => p.pinned)) return true;
  if (!terms.length || !passages.length) return false;
  const text = normalizar(passages.map(p => `${p.title}\n${p.content}`).join('\n'));
  return terms.filter(t => text.includes(t)).length / terms.length >= 0.7;
}
