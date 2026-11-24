import { casoJuridicoIndividual, foraDoEscopo, lacunaConhecida, obrigacaoLegalDeContratacao, semFonteSemChute } from '@/lib/chat/escopo';
import { contemDadosSensiveis, redigirDadosSensiveis } from '@/lib/seguranca/redacao';
import { escolherFontes, trechoDeContato } from '@/lib/recuperacao/fontes';
import { type Situacao } from '@/lib/chat/notas';
import { evidenciaSuficiente } from '@/lib/recuperacao/contexto';
import type { Passagem } from '@/lib/base/tipos';
import { recuperarConhecimento } from '@/lib/recuperacao/recuperar';
import { escolherConector, type Conector } from '@/lib/cerebro/conectores';
import { MAXIMO_DE_FONTES, WRITING } from '@/lib/chat/prompt';

// Decide, por regras, o que fazer com a pergunta: dados sensíveis, caso jurídico, saudação, fora do escopo ou busca de fontes. Nenhuma resposta é escrita aqui.

type Conhecimento = Awaited<ReturnType<typeof recuperarConhecimento>>;
async function referenceWithinBudget(question: string, language: string, conector: Conector | undefined): Promise<Pick<Conhecimento, 'passages' | 'semResposta' | 'lista' | 'relatorio'>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      recuperarConhecimento(question, language, conector),
      new Promise<{ passages: Passagem[]; semResposta: undefined; lista: false; relatorio: false }>(resolve => { timer = setTimeout(() => resolve({ passages: [], semResposta: undefined, lista: false, relatorio: false }), 6500); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
const GREETING = /^(olá|ola|oi|hello|hi|bom dia|boa tarde|boa noite)(?:[,!?.\s]+(?:sindi|tudo bem))*[!.?\s]*$/i;

/** A situação (se a pergunta é tratada por regra), as fontes escolhidas e o conector da área. O modelo só escreve depois disto. */
export async function decidirSituacao({ mensagens, language }: { mensagens: { role: string; content: string }[]; language: string }) {
  const question = mensagens.at(-1)!.content;
  const writing = WRITING.test(question);
  let situacao: Situacao | undefined; let choices: Passagem[] = []; let lista = false; let relatorio = false;
  // As perguntas anteriores entram na busca (inclusive na por significado, que vai ao provedor de IA): dados pessoais e segredos já ditos saem delas.
  const anteriores = mensagens.filter(m => m.role === 'user').slice(-3, -1).map(m => redigirDadosSensiveis(m.content));
  const conector = escolherConector(question, anteriores);
  // Porta de escopo: fora do assunto do setor a SINDI recusa antes de buscar. Uma busca fraca não decide isto, pois acertos de palavras comuns
  // ("São Paulo") e de significado (similaridade alta para tudo) também aparecem em perguntas sem relação. Perguntas de continuação herdam o assunto das anteriores.
  // O conector "sobre a SINDI" casa com "você pode…", que serve a qualquer assunto; por isso ele sozinho não põe a pergunta dentro do escopo.
  const naArea = Boolean(conector) && conector!.id !== 'sobre-a-sindi-e-limites';
  if (contemDadosSensiveis(question)) situacao = 'dados-sensiveis';
  else if (casoJuridicoIndividual(question) || obrigacaoLegalDeContratacao(question)) { situacao = 'caso-juridico'; choices = [trechoDeContato()]; }
  else if (GREETING.test(question.trim())) situacao = 'saudacao';
  else if (!naArea && foraDoEscopo([...anteriores, question].join(' '))) situacao = 'fora-do-escopo';
  else {
    // Continuação curta ("e para empresa filiada?"): a busca usa também a pergunta anterior, que carrega o assunto.
    // A busca por significado manda a consulta ao provedor de embeddings: a pergunta atual também sai redigida, sem depender só do detector acima.
    const atual = redigirDadosSensiveis(question);
    const consulta = anteriores.length && atual.trim().split(/\s+/).length <= 6 ? `${anteriores.at(-1)} ${atual}` : atual;
    const knowledge = await referenceWithinBudget(consulta, language, conector);
    lista = knowledge.lista === true; relatorio = knowledge.relatorio === true;
    // A ordem de relevância vem da busca; aqui só se limpa o texto das fontes escolhidas.
    const candidates = relatorio ? knowledge.passages : escolherFontes(knowledge.passages.slice(0, lista ? 8 : MAXIMO_DE_FONTES), consulta, 8);
    // Official pinned pages answer the question on their own; extra news excerpts only add noise.
    choices = evidenciaSuficiente(candidates, consulta) ? (candidates.some(p => p.pinned) ? candidates.filter(p => p.pinned) : candidates) : [];
    // NR, artigo ou cláusula pedidos que não constam dos textos coletados; fato que a base sabidamente não tem (CNPJ, salário de dirigentes); pergunta sem nenhuma fonte
    // (as áreas de orientação — comercial, RH, custos — podem responder com método geral, sem fato institucional).
    if (writing) choices = choices.filter(p => /orientação geral/i.test(p.title));
    if (knowledge.semResposta || lacunaConhecida(question, choices.map(p => p.content).join(' ')) || (!choices.length && conector?.modo !== 'orientacao' && semFonteSemChute(question))) { situacao = 'sem-fonte'; choices = [trechoDeContato()]; lista = false; relatorio = false; }
  }
  return { situacao, choices, lista, relatorio, conector, anteriores, writing, question };
}
