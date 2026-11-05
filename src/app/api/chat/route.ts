import { chatSchema, historicoParaOModelo, recentMessages } from '@/lib/chat';
import { recordUsage as registrarUso } from '@/lib/usage';
import { modeloPrincipal, modeloRapido, ollamaChat, OllamaError } from '@/lib/ollama';
import { retrieveKnowledge } from '@/lib/knowledge/retrieve';
import { obrigacaoLegalDeContratacao, casoJuridicoIndividual, contemDadosSensiveis, foraDoEscopo, lacunaConhecida, notaDaSituacao, redigirDadosSensiveis, semFonteSemChute, sourceChoices, sourceReferences, trechoDeContato, verificarFatos, type Situacao } from '@/lib/knowledge/grounded';
import { sufficientEvidence } from '@/lib/knowledge/core';
import type { Passage } from '@/lib/knowledge/core';
import { allowedChatOrigin } from '@/lib/origin';
import { escolherConector, type Conector } from '@/lib/cerebro/conectores';
import { exemplos, mensagemDoPedido, sistema, type Mensagem } from '@/lib/cerebro/instrucoes';
import { cacheLigado, chaveDaResposta, guardarResposta, respostaGuardada } from '@/lib/cache-respostas';
import { timingSafeEqual } from 'node:crypto';
export const runtime = 'nodejs';
export const maxDuration = 300;
function error(message: string, status: number) { return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } }); }
type Conhecimento = Awaited<ReturnType<typeof retrieveKnowledge>>;
async function referenceWithinBudget(question: string, language: string, conector: Conector | undefined): Promise<Pick<Conhecimento, 'passages' | 'semResposta' | 'lista' | 'relatorio'>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      retrieveKnowledge(question, language, conector),
      new Promise<{ passages: Passage[]; semResposta: undefined; lista: false; relatorio: false }>(resolve => { timer = setTimeout(() => resolve({ passages: [], semResposta: undefined, lista: false, relatorio: false }), 6500); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
const GREETING = /^(olá|ola|oi|hello|hi|bom dia|boa tarde|boa noite)(?:[,!?.\s]+(?:sindi|tudo bem))*[!.?\s]*$/i;
const WRITING = /\b(redija|reescreva|traduza|translate|draft|write|melhore o texto)\b/i;
/** Pedido de um texto para o usuário preencher (modelo, rascunho, anúncio, e-mail): só aí os campos entre colchetes ficam na resposta. */
const PEDE_MODELO = /\b(modelo|redija|escreva|rascunho|template|an[uú]ncio|e-?mail|carta|estrutur\w*|apresenta[cç][aã]o|proposta)\b/i;
const REDACAO = 'Escreva o texto em nome da empresa do usuário, nunca em nome do SINDEPRESTEM nem da SINDI. Use as fontes só como estrutura: não copie delas valores, salários, leis nem números. Deixe entre colchetes os dados que só o usuário conhece, como [nome da empresa] e [tempo de atuação]; não invente nenhum deles. Não assine como SINDI.';
// Orientações curtas: vão na mensagem de cada pergunta, depois das regras e dos exemplos (que o Ollama reaproveita do cache), então cada palavra aqui é lida toda vez.
const COM_FONTES = 'Responda com as suas palavras, só com o que as fontes dizem, ligando-as ao que foi perguntado. Não copie trechos longos nem títulos.';
const SEM_FONTES = 'Não há fonte para esta pergunta. Você pode dar orientação geral de método, sem citar números, valores, prazos, leis, contatos nem o que o SINDEPRESTEM oferece. Para dados específicos, recomende falar com o SINDEPRESTEM.';
const LISTA = 'As fontes são só títulos de documentos. Diga em uma ou duas frases de que assuntos eles tratam e avise que os links estão nas referências. Não descreva o conteúdo de nenhum documento.';
const ORCAMENTO = 'Apresente o resultado com os números exatos da fonte, sem arredondar nem recalcular. Diga que é uma estimativa e que a ferramenta permite ajustar os postos e baixar o orçamento em PDF.';
const SITUACAO = 'Siga a SITUAÇÃO abaixo.';
// Duas fontes por resposta: a terceira quase nunca traz o fato e, medido com o modelo pequeno, é a que ele mistura com as outras (número de uma fonte atribuído a outra).
const MAXIMO_DE_FONTES = Math.min(4, Math.max(1, Number(process.env.SINDI_MAX_FONTES) || 2));
/** Corta o texto na última frase (ou item de lista) completa, desde que reste a maior parte dele. */
export function ateAUltimaFrase(texto: string) {
  const fim = Math.max(texto.lastIndexOf('. '), texto.lastIndexOf('.\n'), texto.lastIndexOf('\n'));
  if (fim <= texto.length * 0.5) return texto;
  // Sem item de lista vazio ("3.") nem subtítulo sem conteúdo ("Para estruturar a proposta:") no fim.
  return texto.slice(0, fim + 1).trimEnd().replace(/(?:\n\s*(?:\d+[.)]|[-*])?\s*[^\n]{0,3}|\n[^\n]*:)\s*$/, '').trimEnd();
}
/** Tira da resposta o que o modelo pequeno acrescenta por hábito e o servidor já fornece: a lista de fontes ao final (as referências vêm do servidor) e o "as fontes informam que". */
export function limparResposta(texto: string, manterColchetes = true) {
  const semLista = texto.replace(/\n+\**(?:Fontes?|Referências|Refer[eê]ncias?)\**:?\**\s*(?:\n\s*(?:[-*]\s*)?\[?\d+\]?[^\n]*)+\s*$/i, '').replace(/\n+\**(?:Fontes?|Referências)\**:[^\n]*$/i, '');
  // Campos entre colchetes ([nome do cliente]) só fazem sentido quando o usuário pediu um modelo para preencher; numeração repetida ("1. 1.") vira uma só.
  const semCampos = manterColchetes ? semLista : semLista.replace(/\s*\[[^\]\n]{2,40}\]/g, '')
    // O que sobra de uma lista de campos removidos (": , , ." ou "como , e .") também sai.
    .replace(/(:|\bcomo|\bem)(\s*,)+\s*(e\s*)?(?=[.;\n]|$)/g, '$1').replace(/(\s*,)+\s*(e\s*)?(?=[.;:\n]|$)/g, '').replace(/:\s*\./g, '.').replace(/[ \t]+([,.;])/g, '$1');
  // Assinatura "SINDI" no fim de um texto escrito para o usuário.
  const limpo = semCampos.replace(/\n+\s*(?:—\s*)?SINDI\s*$/i, '').replace(/^(\s*)(\d+)\.\s+\2\.\s+/gm, '$1$2. ');
  return limpo.replace(/^\s*(?:Segundo|De acordo com|Conforme) as fontes,?\s+(\p{L})/u, (_, letra: string) => letra.toUpperCase()).replace(/^\s*As fontes (?:informam|indicam|mencionam|dizem|mostram|apontam) que\s+(\p{L})/u, (_, letra: string) => letra.toUpperCase()).trim();
}
type Uso = { inputTokens?: number; outputTokens?: number; totalTokens?: number };
const somar = (a: Uso | undefined, b: Uso): Uso => ({ inputTokens: (a?.inputTokens ?? 0) + (b.inputTokens ?? 0), outputTokens: (a?.outputTokens ?? 0) + (b.outputTokens ?? 0), totalTokens: (a?.totalTokens ?? 0) + (b.totalTokens ?? 0) });

export async function POST(request: Request) {
  const expectedHost = request.headers.get('host') || new URL(request.url).host;
  if (!allowedChatOrigin(request.headers.get('origin'), expectedHost, process.env.SINDI_PUBLIC_ORIGIN, Boolean(process.env.VERCEL))) return error('Origem não permitida.', 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return error('Formato inválido.', 415);
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return error('Mensagem inválida.', 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1000000) { await reader.cancel(); return error('Conversa muito longa.', 413); } chunks.push(value); }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return error('Mensagem inválida.', 400); }
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) return error('Revise a mensagem e tente novamente.', 400);
  const language: string = 'pt';
  const started = Date.now();
  // Aquecimento (scripts/operacao/aquecer.ts): o próprio servidor pergunta as perguntas frequentes para guardar as respostas. Essas chamadas trazem um token
  // gerado a cada publicação e não entram nas métricas públicas de uso; sem o token certo, o pedido é tratado como qualquer outro.
  const tokenEsperado = process.env.SINDI_AQUECIMENTO_TOKEN ?? ''; const tokenRecebido = request.headers.get('x-sindi-aquecimento') ?? '';
  const aquecimento = tokenEsperado.length >= 32 && tokenRecebido.length === tokenEsperado.length && timingSafeEqual(Buffer.from(tokenRecebido), Buffer.from(tokenEsperado));
  const recordUsage: typeof registrarUso = aquecimento ? async () => true : registrarUso;
  const controller = new AbortController();
  async function generate(onDelta?: (text: string) => void, onReset?: () => void) {
  try {
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(240000)]);
    const mensagens = parsed.data!.messages; const question = mensagens.at(-1)!.content;
    // Dados pessoais e segredos nunca chegam ao modelo: a pergunta e o histórico seguem com o trecho removido.
    const recentes = recentMessages(mensagens).map(message => ({ ...message, content: redigirDadosSensiveis(message.content) }));
    const pergunta = recentes.at(-1)!.content; const historico = historicoParaOModelo(recentes.slice(0, -1));
    const writing = WRITING.test(question);

    // Nenhuma resposta é escrita pelo servidor: a SINDI decide a situação e a área (conector) por regras, busca as fontes e o modelo escreve.
    let situacao: Situacao | undefined; let choices: Passage[] = []; let lista = false; let relatorio = false;
    const anteriores = mensagens.filter(m => m.role === 'user').slice(-3, -1).map(m => m.content);
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
      const consulta = anteriores.length && question.trim().split(/\s+/).length <= 6 ? `${anteriores.at(-1)} ${question}` : question;
      const knowledge = await referenceWithinBudget(consulta, language, conector);
      lista = knowledge.lista === true; relatorio = knowledge.relatorio === true;
      // A ordem de relevância vem da busca; aqui só se limpa o texto das fontes escolhidas.
      const candidates = relatorio ? knowledge.passages : sourceChoices(knowledge.passages.slice(0, lista ? 8 : MAXIMO_DE_FONTES), consulta, 8);
      // Official pinned pages answer the question on their own; extra news excerpts only add noise.
      choices = sufficientEvidence(candidates, consulta) ? (candidates.some(p => p.pinned) ? candidates.filter(p => p.pinned) : candidates) : [];
      // NR, artigo ou cláusula pedidos que não constam dos textos coletados; fato que a base sabidamente não tem (CNPJ, salário de dirigentes); pergunta sem nenhuma fonte
      // (as áreas de orientação — comercial, RH, custos — podem responder com método geral, sem fato institucional).
      if (writing) choices = choices.filter(p => /orientação geral/i.test(p.title));
      if (knowledge.semResposta || lacunaConhecida(question, choices.map(p => p.content).join(' ')) || (!choices.length && conector?.modo !== 'orientacao' && semFonteSemChute(question))) { situacao = 'sem-fonte'; choices = [trechoDeContato()]; lista = false; relatorio = false; }
    }

    // Em CPU o que mais demora é ler o que muda a cada pergunta (as regras e os exemplos são reaproveitados do cache do Ollama): as fontes têm orçamento de caracteres
    // e a resposta tem limite de palavras, definido pelo conector da área.
    const base: Mensagem[] = [{ role: 'system', content: sistema() }, ...exemplos(), ...historico as Mensagem[]];
    const pedido = (nota: string, fontes: Passage[]) => {
      const calculo = fontes[0]?.title.startsWith('Ferramenta de orçamento');
      const orientacao = writing && !nota.includes('SITUAÇÃO') ? REDACAO : nota.includes('SITUAÇÃO') ? SITUACAO : calculo ? ORCAMENTO : lista && fontes === choices ? LISTA : !fontes.length ? (conector?.modo === 'orientacao' ? `${conector.instrucao} ${SEM_FONTES}` : SEM_FONTES) : conector && fontes === choices ? conector.instrucao : COM_FONTES;
      const palavras = nota.includes('SITUAÇÃO') ? 40 : lista ? 50 : relatorio ? 80 : conector?.palavras ?? 55;
      return { texto: mensagemDoPedido({ orientacao, palavras, nota, fontes, pergunta, orcamento: relatorio ? 2200 : lista ? 1400 : 1200 }), palavras };
    };
    const fatos = (fontes: Passage[]) => fontes.map(p => `${p.title} ${p.content}`).join(' ');

    let uso: Uso | undefined; let texto = ''; let fontesUsadas = choices; let confiavel = false;
    // Verificação de fatos: e-mail, site, telefone, valor, número ou lei que não conste nas fontes indica invenção do modelo. Nesse caso o modelo reescreve, com a correção; se ainda
    // falhar, escreve sem afirmar nada além do contato oficial. A resposta nunca é um texto fixo do servidor.
    const tentativas: { nota: string; fontes: Passage[] }[] = [
      { nota: situacao ? notaDaSituacao(situacao) : '', fontes: choices },
      { nota: notaDaSituacao('correcao') + (situacao ? notaDaSituacao(situacao) : ''), fontes: choices },
      { nota: notaDaSituacao('sem-fonte'), fontes: [trechoDeContato()] },
    ];
    // Primeira pergunta de uma conversa com as mesmas regras, exemplos e fontes: a resposta já escrita e verificada sai da memória (ver cache-respostas.ts).
    const primeira = pedido(tentativas[0].nota, tentativas[0].fontes);
    // Modelo por tipo de pedido: o rápido só para o que é curto e roteirizado (saudação, recusa, encaminhamento: o servidor já decidiu o que dizer);
    // o principal para tudo o que exige ler fontes. Medido: nas perguntas sobre a própria SINDI o rápido errou 3 de 10 (chegou a dizer que a SINDI é o sindicato).
    let modelo = modeloRapido() && situacao ? modeloRapido() : modeloPrincipal();
    const chave = cacheLigado() && mensagens.length === 1 && situacao !== 'dados-sensiveis' ? chaveDaResposta(modelo, JSON.stringify(base), primeira.texto) : undefined;
    const guardada = chave ? respostaGuardada(chave) : undefined;
    if (guardada) {
      onDelta?.(guardada);
      const metricsRecorded = await recordUsage({ success: true, durationMs: Date.now() - started });
      return Response.json({ text: guardada, metricsRecorded }, { headers: { 'Cache-Control': 'no-store' } });
    }
    for (const [indice, tentativa] of tentativas.entries()) {
      if (indice > 0) onReset?.();
      const { texto: conteudo, palavras } = indice === 0 ? primeira : pedido(tentativa.nota, tentativa.fontes);
      // Teto de tokens com folga sobre o limite de palavras: impede que uma resposta descontrolada ocupe o computador por minutos.
      const gerar = (qual: string) => ollamaChat([...base, { role: 'user', content: conteudo }], signal, onDelta, { options: { num_predict: Math.round(palavras * 2.2) + 40 } }, qual);
      // Sem o modelo rápido instalado, o principal responde.
      const { text, usage, truncada } = await gerar(modelo).catch(falha => { if (falha instanceof OllamaError && falha.status === 404 && modelo !== modeloPrincipal()) { modelo = modeloPrincipal(); return gerar(modelo); } throw falha; });
      // Resposta cortada pelo teto: fica até a última frase completa (o evento final substitui na tela o texto parcial já mostrado).
      uso = somar(uso, usage); texto = limparResposta(truncada ? ateAUltimaFrase(text) : text, writing || PEDE_MODELO.test(question)); fontesUsadas = tentativa.fontes;
      // A reescrita depois de uma reprovação é sempre do modelo principal.
      modelo = modeloPrincipal();
      confiavel = !texto.trim() || verificarFatos(texto, fatos(tentativa.fontes), [...anteriores, question].join(' ')).ok;
      if (confiavel) break;
    }
    if (!confiavel) { await recordUsage({ success: false, durationMs: Date.now() - started, usage: uso }); return error('Não foi possível gerar uma resposta confiável. Tente reformular a pergunta.', 502); }
    const references = !writing && texto.trim() && fontesUsadas.length ? sourceReferences(fontesUsadas, language) : '';
    onDelta?.(references);
    const metricsRecorded = await recordUsage({ success: Boolean(texto.trim()), durationMs: Date.now() - started, usage: uso });
    if (!texto.trim()) return error('Não foi possível gerar uma resposta. Tente novamente.', 502);
    if (chave && fontesUsadas === choices) guardarResposta(chave, texto + references);
    return Response.json({ text: texto + references, metricsRecorded }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    await recordUsage({ success: false, durationMs: Date.now() - started });
    if (cause instanceof OllamaError) return error(cause.message, cause.status);
    if (cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name)) return error('O modelo local demorou para responder. Tente novamente quando as outras conversas terminarem.', 504);
    console.warn('SINDI local service failure', { type: cause instanceof Error ? cause.name : 'unknown' });
    return error('Não foi possível conectar ao Ollama. Abra o Ollama neste computador e tente novamente.', 503);
  }
  }
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) return generate();
  const encoder = new TextEncoder(); let cancelled = false;
  const stream = new ReadableStream({
    async start(streamController) {
      const send = (event: object) => { if (!cancelled) streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      const response = await generate(text => send({ type: 'delta', text }), () => send({ type: 'reset' }));
      const data = await response.json();
      send(response.ok ? { type: 'done', ...data } : { type: 'error', error: data.error });
      if (!cancelled) streamController.close();
    },
    cancel() { cancelled = true; controller.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
