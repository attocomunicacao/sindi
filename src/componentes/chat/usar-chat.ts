'use client';
import { useEffect, useRef, useState } from 'react';
import { LeitorDoChat, textoParaLeitor, type EventoDoChat } from '@/lib/chat/leitor-ndjson';
import { sortearSugestoes } from '@/lib/sugestoes';
import { NOVA_CONVERSA } from '@/componentes/chat/nova-conversa';
import {
  avisoDaFalha,
  LIMITE_DA_PERGUNTA,
  pedirResposta,
  type MensagemDaConversa,
} from '@/componentes/chat/pedir-resposta';
import { useTeclaEsc } from '@/componentes/ui/usar-tecla-esc';

/** Quanto falta para o fim da página (px) para ainda se considerar que quem lê está acompanhando a resposta. */
const MARGEM_DO_FIM = 160;

/** O que o envio já recebeu da resposta em andamento; a falha usa isso para decidir o que fica na tela. */
type Progresso = { parcial: string; erroDoServidor: boolean };

/**
 * Estado e ações da conversa: envia a pergunta, lê a resposta em fluxo, trata interrupção e falhas, e acompanha a rolagem.
 * A tela só descreve o que o hook devolve.
 */
export function useChat() {
  const [mensagens, setMensagens] = useState<MensagemDaConversa[]>([]);
  const [entrada, setEntrada] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [consumoNaoRegistrado, setConsumoNaoRegistrado] = useState(false);
  // Mensagens que ainda restam hoje para quem está usando (a cota vem da resposta do servidor; some quando a cota está desligada ou a resposta veio da memória).
  const [restantes, setRestantes] = useState<number | null>(null);
  // Leitores de tela: a resposta é anunciada uma vez, quando completa (o texto que cresce a cada token não fica numa região ao vivo).
  const [anuncio, setAnuncio] = useState('');
  // Três perguntas diferentes a cada vez que a tela inicial aparece (ao abrir o chat e ao iniciar uma nova conversa). O sorteio roda no navegador, depois da hidratação.
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  // A tela só acompanha a resposta se quem lê já estava no fim: quem rolou para cima para reler não é arrastado de volta.
  const noFim = useRef(true);
  const ocupado = useRef(false);
  // Controle da resposta em andamento: o botão Parar (ou Esc) o aborta, o que cancela a leitura no navegador e a geração no servidor.
  const controle = useRef<AbortController | null>(null);
  const caixaDeTexto = useRef<HTMLTextAreaElement>(null);
  const fimDaConversa = useRef<HTMLDivElement>(null);
  const vazia = mensagens.length === 0;

  // Sorteio no navegador após a hidratação, para não divergir do HTML do servidor.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver o comentário acima
    if (vazia) setSugestoes((anteriores) => sortearSugestoes(anteriores));
  }, [vazia]);
  useEffect(() => {
    const medir = () => {
      noFim.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - MARGEM_DO_FIM;
    };
    window.addEventListener('scroll', medir, { passive: true });
    return () => window.removeEventListener('scroll', medir);
  }, []);
  useEffect(() => {
    if (mensagens.length && noFim.current)
      fimDaConversa.current?.scrollIntoView({ block: 'end', behavior: carregando ? 'auto' : 'smooth' });
  }, [mensagens, carregando]);

  const parar = () => controle.current?.abort();
  useTeclaEsc(carregando, parar);
  useEffect(() => {
    const limpar = () => {
      if (ocupado.current) return;
      setMensagens([]);
      setErro('');
      setEntrada('');
      setAnuncio('');
      caixaDeTexto.current?.focus({ preventScroll: true });
    };
    window.addEventListener(NOVA_CONVERSA, limpar);
    return () => window.removeEventListener(NOVA_CONVERSA, limpar);
  }, []);

  /** Lê o fluxo NDJSON da resposta e vai atualizando a conversa; qualquer fim que não seja o evento "done" é falha. */
  async function lerResposta(corpo: ReadableStream<Uint8Array>, pendentes: MensagemDaConversa[], progresso: Progresso) {
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
  function tratarFalha(
    causa: unknown,
    interrupcao: AbortController,
    anteriores: MensagemDaConversa[],
    pendentes: MensagemDaConversa[],
    pergunta: string,
    progresso: Progresso,
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

  async function enviar(texto = entrada) {
    const pergunta = texto.trim();
    if (!pergunta || pergunta.length > LIMITE_DA_PERGUNTA || ocupado.current) return;

    ocupado.current = true;
    noFim.current = true;
    setCarregando(true);
    setErro('');
    setEntrada('');
    setAnuncio('');
    const interrupcao = new AbortController();
    controle.current = interrupcao;
    const progresso: Progresso = { parcial: '', erroDoServidor: false };
    const anteriores = mensagens;
    const pendentes: MensagemDaConversa[] = [...anteriores, { role: 'user', content: pergunta }];
    setMensagens(pendentes);
    try {
      await lerResposta(await pedirResposta(pendentes, interrupcao.signal), pendentes, progresso);
    } catch (causa) {
      tratarFalha(causa, interrupcao, anteriores, pendentes, pergunta, progresso);
    } finally {
      ocupado.current = false;
      controle.current = null;
      setCarregando(false);
      caixaDeTexto.current?.focus({ preventScroll: true });
    }
  }

  return {
    mensagens,
    entrada,
    setEntrada,
    carregando,
    erro,
    consumoNaoRegistrado,
    restantes,
    anuncio,
    sugestoes,
    vazia,
    enviar,
    parar,
    caixaDeTexto,
    fimDaConversa,
  };
}
