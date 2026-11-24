'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sortearSugestoes } from '@/lib/sugestoes';
import { NOVA_CONVERSA } from '@/componentes/chat/nova-conversa';
import { LIMITE_DA_PERGUNTA, pedirResposta, type MensagemDaConversa } from '@/componentes/chat/pedir-resposta';
import { lerResposta, tratarFalha, type Progresso } from '@/componentes/chat/ler-resposta';
import { useHistorico } from '@/componentes/chat/usar-historico';
import { useTeclaEsc } from '@/componentes/ui/usar-tecla-esc';

/** Quanto falta para o fim da página (px) para ainda se considerar que quem lê está acompanhando a resposta. */
const MARGEM_DO_FIM = 160;

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
      // Mede pelo fim da conversa, não pelo fim do documento: o rodapé do site fica abaixo dela.
      const fim = fimDaConversa.current;
      noFim.current = fim
        ? fim.getBoundingClientRect().bottom <= window.innerHeight + MARGEM_DO_FIM
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - MARGEM_DO_FIM;
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
  // Esvazia a tela (nova conversa) ou a preenche com uma conversa guardada; nunca no meio de uma resposta.
  const mostrar = useCallback((conversa: MensagemDaConversa[]) => {
    if (ocupado.current) return;
    setMensagens(conversa);
    setErro('');
    setEntrada('');
    setAnuncio('');
    caixaDeTexto.current?.focus({ preventScroll: true });
  }, []);
  const limparTela = useCallback(() => mostrar([]), [mostrar]);
  const historico = useHistorico({ mensagens, carregando, aoAbrir: mostrar, aoLimpar: limparTela });
  const { nova } = historico;
  const comecarNova = useCallback(() => {
    if (ocupado.current) return;
    nova();
    limparTela();
  }, [nova, limparTela]);
  useEffect(() => {
    window.addEventListener(NOVA_CONVERSA, comecarNova);
    return () => window.removeEventListener(NOVA_CONVERSA, comecarNova);
  }, [comecarNova]);

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
      await lerResposta(await pedirResposta(pendentes, interrupcao.signal), pendentes, progresso, {
        setMensagens,
        setConsumoNaoRegistrado,
        setRestantes,
        setAnuncio,
      });
    } catch (causa) {
      tratarFalha(causa, interrupcao, anteriores, pendentes, pergunta, progresso, {
        setMensagens,
        setEntrada,
        setErro,
      });
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
    historico,
    comecarNova,
    caixaDeTexto,
    fimDaConversa,
  };
}
