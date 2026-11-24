import { LeitorDoChat, textoParaLeitor, type EventoDoChat } from '@/lib/chat/leitor-ndjson';
import { guardarUltimoUso } from '@/componentes/cerebro/ultimo-uso';
import { avisoDaFalha, type MensagemDaConversa } from '@/componentes/chat/pedir-resposta';

/** O que o envio já recebeu da resposta em andamento; a falha usa isso para decidir o que fica na tela. */
export type Progresso = { parcial: string; erroDoServidor: boolean };

/** Setters do estado da conversa, repassados pelo hook para que a leitura do fluxo viva fora dele. */
export type DestinosDaLeitura = {
  setMensagens: (mensagens: MensagemDaConversa[]) => void;
  setConsumoNaoRegistrado: (registrado: boolean) => void;
  setRestantes: (restantes: number) => void;
  setAnuncio: (anuncio: string) => void;
};

export type DestinosDaFalha = {
  setMensagens: (mensagens: MensagemDaConversa[]) => void;
  setEntrada: (entrada: string) => void;
  setErro: (erro: string) => void;
};

/** Lê o fluxo NDJSON da resposta e vai atualizando a conversa; qualquer fim que não seja o evento "done" é falha. */
export async function lerResposta(
  corpo: ReadableStream<Uint8Array>,
  pendentes: MensagemDaConversa[],
  progresso: Progresso,
  { setMensagens, setConsumoNaoRegistrado, setRestantes, setAnuncio }: DestinosDaLeitura,
) {
  const leitorDoCorpo = corpo.getReader();
  const leitor = new LeitorDoChat();
  let resposta = '';
  let completa = false;
  // Os pedaços chegam a cada token; a tela é atualizada no máximo uma vez por quadro, para o markdown não ser refeito dezenas de vezes por segundo.
  let quadro = 0;
  const mostrar = () => {
    quadro = 0;
    setMensagens([...pendentes, { role: 'assistant', content: resposta }]);
  };
  const cancelarQuadro = () => {
    if (quadro) {
      cancelAnimationFrame(quadro);
      quadro = 0;
    }
  };

  const tratar = (evento: EventoDoChat) => {
    // Erro enviado pelo servidor (cota, resposta reprovada): o texto parcial não é confiável e não fica na conversa.
    if (evento.type === 'error') {
      progresso.erroDoServidor = true;
      throw new Error(evento.error || 'A resposta foi interrompida.');
    }
    if (evento.type === 'reset') {
      cancelarQuadro();
      resposta = '';
      progresso.parcial = '';
      setMensagens([...pendentes, { role: 'assistant', content: '' }]);
    }
    if (evento.type === 'delta') {
      resposta += evento.text;
      progresso.parcial = resposta;
      if (!quadro) quadro = requestAnimationFrame(mostrar);
    }
    if (evento.type === 'done') {
      cancelarQuadro();
      completa = true;
      setConsumoNaoRegistrado(evento.metricsRecorded === false);
      if (typeof evento.restantes === 'number') setRestantes(evento.restantes);
      guardarUltimoUso(evento.cerebro);
      setMensagens([...pendentes, { role: 'assistant', content: evento.text }]);
      setAnuncio(textoParaLeitor(evento.text));
    }
  };

  try {
    while (true) {
      const { value, done } = await leitorDoCorpo.read();
      for (const evento of leitor.empurrar(value, done)) tratar(evento);
      if (done) break;
    }
    if (leitor.invalidas || !completa) throw new Error('A resposta foi interrompida. Tente novamente.');
  } finally {
    cancelarQuadro();
    await leitorDoCorpo.cancel().catch(() => {});
    leitorDoCorpo.releaseLock();
  }
}

/** Falha ou interrupção: decide se o texto parcial fica na conversa ou se a pergunta volta para a caixa de texto. */
export function tratarFalha(
  causa: unknown,
  interrupcao: AbortController,
  anteriores: MensagemDaConversa[],
  pendentes: MensagemDaConversa[],
  pergunta: string,
  progresso: Progresso,
  { setMensagens, setEntrada, setErro }: DestinosDaFalha,
) {
  const temParcial = progresso.parcial.trim() !== '';
  const manterParcial = () => setMensagens([...pendentes, { role: 'assistant', content: progresso.parcial }]);
  const devolverPergunta = () => {
    setMensagens(anteriores);
    setEntrada(pergunta);
  };
  // Interrompida por quem enviou: se já havia texto, ele fica; se nada tinha chegado, a pergunta volta para a caixa de texto, para editar ou descartar.
  if (interrupcao.signal.aborted) {
    if (temParcial) manterParcial();
    else devolverPergunta();
    return;
  }
  const aviso = avisoDaFalha(causa);
  // A conexão caiu no meio da resposta: o que já chegou fica na tela (com o aviso), e a pergunta continua na conversa.
  if (!progresso.erroDoServidor && temParcial) {
    manterParcial();
    setErro(aviso);
    return;
  }
  devolverPergunta();
  setErro(aviso);
}
