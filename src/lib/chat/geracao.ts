import { gerarTexto, LlmError, modeloPrincipal } from '@/lib/gemini';
import type { Mensagem } from '@/lib/cerebro/instrucoes';
import type { Passage } from '@/lib/knowledge/core';
import { notaDaSituacao, trechoDeContato, verificarFatos, type Situacao } from '@/lib/knowledge/grounded';
import { ateAUltimaFrase, limparResposta, somar, type Uso } from './prompt';

export type Tentativa = { nota: string; fontes: Passage[] };
/**
 * Verificação de fatos: e-mail, site, telefone, valor, número ou lei que não conste nas fontes indica invenção do modelo. Nesse caso o modelo reescreve, com a correção; se ainda
 * falhar, escreve sem afirmar nada além do contato oficial. A resposta nunca é um texto fixo do servidor.
 */
export function tentativasDeResposta(situacao: Situacao | undefined, choices: Passage[]): Tentativa[] {
  return [
    { nota: situacao ? notaDaSituacao(situacao) : '', fontes: choices },
    { nota: notaDaSituacao('correcao') + (situacao ? notaDaSituacao(situacao) : ''), fontes: choices },
    { nota: notaDaSituacao('sem-fonte'), fontes: [trechoDeContato()] },
  ];
}
const fatosDas = (fontes: Passage[]) => fontes.map(p => `${p.title} ${p.content}`).join(' ');

export type OpcoesDaEscrita = {
  base: Mensagem[]; tentativas: Tentativa[];
  pedido: (nota: string, fontes: Passage[]) => { texto: string; palavras: number };
  /** O pedido da primeira tentativa, já montado (a chave da memória de respostas depende dele). */
  primeira: { texto: string; palavras: number };
  modelo: string; signal: AbortSignal; onDelta?: (texto: string) => void; onReset?: () => void;
  /** O usuário pediu um texto para preencher (modelo, rascunho): só aí os campos entre colchetes ficam na resposta. */
  manterColchetes: boolean;
  /** Perguntas do usuário na conversa, para a verificação aceitar números que ele mesmo citou. */
  perguntas: string;
};

/** Escreve a resposta com o modelo e a verifica contra as fontes; reescreve até três vezes. `confiavel` é falso se nenhuma tentativa passou. */
export async function escreverComVerificacao(o: OpcoesDaEscrita) {
  let modelo = o.modelo; let uso: Uso | undefined; let texto = ''; let fontesUsadas = o.tentativas[0].fontes; let confiavel = false;
  for (const [indice, tentativa] of o.tentativas.entries()) {
    if (indice > 0) o.onReset?.();
    const { texto: conteudo, palavras } = indice === 0 ? o.primeira : o.pedido(tentativa.nota, tentativa.fontes);
    // Teto de tokens com folga sobre o limite de palavras: impede que uma resposta descontrolada gaste o limite gratuito do provedor.
    const gerar = (qual: string) => gerarTexto([...o.base, { role: 'user', content: conteudo }], o.signal, o.onDelta, { maxTokens: Math.round(palavras * 2.2) + 40 }, qual);
    // Se o modelo rápido configurado não existir, o principal responde.
    const { text, usage, truncada } = await gerar(modelo).catch(falha => { if (falha instanceof LlmError && falha.status === 404 && modelo !== modeloPrincipal()) { modelo = modeloPrincipal(); return gerar(modelo); } throw falha; });
    // Resposta cortada pelo teto: fica até a última frase completa (o evento final substitui na tela o texto parcial já mostrado).
    uso = somar(uso, usage); texto = limparResposta(truncada ? ateAUltimaFrase(text) : text, o.manterColchetes); fontesUsadas = tentativa.fontes;
    // A reescrita depois de uma reprovação é sempre do modelo principal.
    modelo = modeloPrincipal();
    confiavel = !texto.trim() || verificarFatos(texto, fatosDas(tentativa.fontes), o.perguntas).ok;
    if (confiavel) break;
  }
  return { texto, uso, fontesUsadas, confiavel };
}
