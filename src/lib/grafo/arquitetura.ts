// Sem dependências: o modo "Arquitetura" da página /cerebro desenha este grafo fixo, sem ir ao servidor.
import type { Aresta, No } from '@/lib/grafo/tipos';

/**
 * O caminho de uma pergunta pela SINDI, como rede: guarda → orquestrador → especialistas → fontes → redação em cascata → verificação → resposta.
 * Reflete o código (src/app/api/chat/route.ts, src/lib/agentes, src/lib/ia/cascata.ts, src/lib/seguranca/verificar-fatos.ts); mudou o fluxo, mude aqui.
 */
type Item = [id: string, rotulo: string, x: number, y: number, tipo?: No['tipo'], href?: string];
const ITENS: Item[] = [
  ['arq:pergunta', 'Pergunta', -980, 0, 'sistema'],
  ['arq:guarda', 'Guarda (origem, cota, dados pessoais)', -760, 60, 'sistema'],
  ['arq:orquestrador', 'Orquestrador', -520, 0, 'nucleo'],
  ['arq:esp-sobre', 'Sobre a SINDI e limites', -230, -330, 'conector'],
  ['arq:esp-legislacao', 'Legislação e segurança jurídica', -230, -220, 'conector'],
  ['arq:esp-setor', 'Inteligência setorial e relatórios', -230, -110, 'conector'],
  ['arq:esp-comercial', 'Comercial, contratos e propostas', -230, 0, 'conector'],
  ['arq:esp-rh', 'RH, recrutamento e qualificação', -230, 110, 'conector'],
  ['arq:esp-custos', 'Custos, tributação e planejamento', -230, 220, 'conector'],
  ['arq:esp-relacionamento', 'Relacionamento com o Sindeprestem', -230, 330, 'conector'],
  ['arq:cerebro', 'Cérebro (palavras + significado)', 90, -240, 'conhecimento', '/base/cerebro'],
  ['arq:biblioteca', 'Biblioteca (SQLite, 14 estantes)', 90, -80, 'estante', '/base'],
  ['arq:grafo', 'Grafo (leis, NRs, projetos)', 90, 80, 'lei', '/cerebro'],
  ['arq:ferramentas', 'Ferramentas (orçamento)', 90, 240, 'documento', '/orcamento'],
  ['arq:redacao', 'Redação em cascata', 360, -60, 'sistema'],
  ['arq:gemini', 'Gemini (gratuito)', 610, -300, 'sistema'],
  ['arq:groq', 'Groq (gratuito)', 610, -200, 'sistema'],
  ['arq:openrouter', 'OpenRouter :free', 610, -100, 'sistema'],
  ['arq:mistral', 'Mistral (gratuito)', 610, 0, 'sistema'],
  ['arq:cloudflare', 'Cloudflare Workers AI', 610, 100, 'sistema'],
  ['arq:anthropic', 'Claude Haiku (pago, desligado)', 610, 200, 'sistema', '/custos'],
  ['arq:ollama', 'Ollama local (emergência)', 610, 300, 'sistema'],
  ['arq:verificador', 'Verificador de fatos', 860, 60, 'nr'],
  ['arq:resposta', 'Resposta com referências', 1080, 0, 'sistema'],
];
const LIGACOES: [string, string][] = [
  ['arq:pergunta', 'arq:guarda'],
  ['arq:guarda', 'arq:orquestrador'],
  ...['sobre', 'legislacao', 'setor', 'comercial', 'rh', 'custos', 'relacionamento'].flatMap(
    (e) => [['arq:orquestrador', `arq:esp-${e}`]] as [string, string][],
  ),
  ...['sobre', 'legislacao', 'setor', 'comercial', 'rh', 'custos', 'relacionamento'].flatMap((e) =>
    (e === 'sobre'
      ? ['cerebro']
      : e === 'comercial' || e === 'custos'
        ? ['cerebro', 'biblioteca', 'ferramentas']
        : ['cerebro', 'biblioteca', 'grafo']
    ).map((f) => [`arq:esp-${e}`, `arq:${f}`] as [string, string]),
  ),
  ['arq:biblioteca', 'arq:grafo'],
  ...['cerebro', 'biblioteca', 'grafo', 'ferramentas'].map((f) => [`arq:${f}`, 'arq:redacao'] as [string, string]),
  ...['gemini', 'groq', 'openrouter', 'mistral', 'cloudflare', 'anthropic', 'ollama'].flatMap(
    (p) =>
      [
        ['arq:redacao', `arq:${p}`],
        [`arq:${p}`, 'arq:verificador'],
      ] as [string, string][],
  ),
  ['arq:verificador', 'arq:redacao'],
  ['arq:verificador', 'arq:resposta'],
];

export function grafoDaArquitetura(): { nos: No[]; arestas: Aresta[] } {
  const arestas: Aresta[] = LIGACOES.map(([de, para]) => ({ de, para, tipo: 'fluxo', peso: 1 }));
  const grau = new Map<string, number>();
  for (const a of arestas) {
    grau.set(a.de, (grau.get(a.de) ?? 0) + 1);
    grau.set(a.para, (grau.get(a.para) ?? 0) + 1);
  }
  return {
    nos: ITENS.map(([id, rotulo, x, y, tipo = 'sistema', href]) => ({
      id,
      rotulo,
      x,
      y,
      tipo,
      grupo: 'arquitetura',
      href,
      grau: grau.get(id) ?? 0,
    })),
    arestas,
  };
}
