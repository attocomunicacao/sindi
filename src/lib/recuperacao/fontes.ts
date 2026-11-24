import { URL_CONTATO } from '@/lib/base/constantes';
import type { Passagem } from '@/lib/base/tipos';
import { normalizar, termosDaConsulta } from '@/lib/base/texto';
export function limparTrecho(content: string): string {
  const lines = content.replace(/([\p{L}])-\s*\n\s*([\p{L}])/gu, '$1$2').split('\n');
  const short = lines.filter(line => line.trim() && line.trim().length < 55).length;
  if (/\b(indice|sumario|table of contents)\b/.test(normalizar(content)) && short / Math.max(lines.length, 1) > 0.5) return '';
  return lines.filter(line => !/^\s*(\d+\s*|\d+\s*\|\s*SINDEPRESTEM|Rodapé institucional:)$/i.test(line))
    .join('\n').replace(/([^\n])\n(?=[\p{Ll}])/gu, '$1 ').trim();
}
export function escolherFontes(passages: Passagem[], question: string, maximo = 4): Passagem[] {
  const terms = termosDaConsulta(question);
  return passages.map(p => ({ ...p, content: limparTrecho(p.content) })).filter(p => p.content.length > 50)
    .sort((a,b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || terms.filter(t => normalizar(b.content).includes(t)).length - terms.filter(t => normalizar(a.content).includes(t)).length).slice(0, maximo);
}
export function referenciasDasFontes(escolhidas: Passagem[]): string {
  const unique = [...new Map(escolhidas.map(p => [p.url, p])).values()];
  if (!unique.length) return '';
  return '\n\n' + 'Referências: ' + unique.map(p => {
    const title = /\.pdf$/i.test(p.title) ? 'Publicação do SINDEPRESTEM' : p.title;
    return `[${title.replace(/[\[\]\\]/g, '')}](${p.url})`;
  }).join(' · ');
}
/** Contato oficial como fonte (dado, não resposta): o modelo o usa ao encaminhar o usuário, e a referência aponta para a página de contato. */
export const trechoDeContato = (): Passagem => ({ url: URL_CONTATO, title: 'Contato do SINDEPRESTEM', fetchedAt: new Date().toISOString(), pinned: true,
  content: 'Contatos do SINDEPRESTEM: telefone (11) 3215-8250; e-mail sindeprestem@sindeprestem.com.br; Setor Jurídico e Gerência: (11) 3215-8250, juridico@sindeprestem.com.br; comunicação (WhatsApp): (11) 99205-3371. Atendimento de segunda a sexta, das 08:30 às 17:30. Endereço: Av. São Luís, 258, 18º andar, Centro Histórico de São Paulo.' });
