import { createHash } from 'node:crypto';

/**
 * Memória de respostas já escritas pelo modelo, só neste processo e só em RAM: a mesma pergunta, com as mesmas regras e as mesmas fontes, recebe na hora a resposta
 * que o modelo escreveu e que passou pela verificação de fatos. A chave é um resumo criptográfico (a pergunta em si não é guardada), nada vai a disco nem a log, e
 * qualquer mudança nas fontes, nas regras, nos exemplos ou no modelo muda a chave. Só vale para a primeira pergunta de uma conversa, que não depende de histórico.
 * `SINDI_CACHE_RESPOSTAS=0` desliga.
 */
// 24 horas por padrão: as respostas das perguntas frequentes são preparadas a cada publicação (aquecimento) e valem enquanto as fontes não mudarem.
const validadeMs = () => {
  const horas = Number(process.env.SINDI_CACHE_HORAS);
  return (horas > 0 && horas <= 168 ? horas : 24) * 60 * 60 * 1000;
};
const MAXIMO = 500;
const respostas = new Map<string, { texto: string; ate: number }>();
export const cacheLigado = () => process.env.SINDI_CACHE_RESPOSTAS !== '0';
export const chaveDaResposta = (...partes: string[]) =>
  createHash('sha256').update(partes.join('\u0000')).digest('hex');
export function respostaGuardada(chave: string, agora = Date.now()): string | undefined {
  const achada = respostas.get(chave);
  if (!achada) return undefined;
  if (achada.ate < agora) {
    respostas.delete(chave);
    return undefined;
  }
  // Reinsere para que as mais usadas sejam as últimas a sair.
  respostas.delete(chave);
  respostas.set(chave, achada);
  return achada.texto;
}
export function guardarResposta(chave: string, texto: string, agora = Date.now()) {
  respostas.delete(chave);
  respostas.set(chave, { texto, ate: agora + validadeMs() });
  while (respostas.size > MAXIMO) respostas.delete(respostas.keys().next().value!);
}
export function limparRespostasGuardadas() {
  respostas.clear();
  emAndamento.clear();
}

// Mesma pergunta, mesmas regras e fontes chegando ao mesmo tempo: só a primeira gera; as outras esperam o resultado e o reaproveitam (e não gastam o limite do provedor).
const emAndamento = new Map<string, Promise<string | undefined>>();
/** Resposta que outra requisição está gerando agora, se houver. Resolve com o texto final, ou `undefined` se aquela geração falhou (aí quem esperou gera por conta própria). */
export const esperarIgual = (chave: string): Promise<string | undefined> | undefined => emAndamento.get(chave);
/** Registra que esta requisição vai gerar a resposta da chave. Devolve a função que conclui (com o texto, ou sem ele em caso de falha); só a primeira chamada vale. */
export function abrirGeracao(chave: string): (texto?: string) => void {
  let concluir!: (texto?: string) => void;
  let feito = false;
  const promessa = new Promise<string | undefined>((resolver) => {
    concluir = resolver;
  });
  emAndamento.set(chave, promessa);
  return (texto) => {
    if (feito) return;
    feito = true;
    if (emAndamento.get(chave) === promessa) emAndamento.delete(chave);
    concluir(texto);
  };
}
