'use client';
import { useEffect, useState } from 'react';
import { useChat } from '@/componentes/chat/usar-chat';
import { TelaInicial } from '@/componentes/chat/tela-inicial';
import { ListaDeMensagens } from '@/componentes/chat/lista-de-mensagens';
import { Compositor } from '@/componentes/chat/compositor';
import { BarraDeConversas } from '@/componentes/chat/barra-de-conversas';
import { GavetaDeConversas } from '@/componentes/chat/gaveta-de-conversas';
import { ABRIR_CONVERSAS } from '@/componentes/chat/nova-conversa';

/**
 * A página do chat: tela de abertura enquanto não há mensagens, depois a conversa, sempre com o compositor no rodapé. As conversas anteriores ficam numa
 * coluna à esquerda no desktop e numa gaveta no celular. No HTML a coluna vem DEPOIS do chat (o teclado chega à caixa de mensagem primeiro) e a ordem
 * visual é trocada só pelo CSS.
 */
export function Conversa() {
  const chat = useChat();
  const [gavetaAberta, setGavetaAberta] = useState(false);
  useEffect(() => {
    const abrir = () => setGavetaAberta(true);
    window.addEventListener(ABRIR_CONVERSAS, abrir);
    return () => window.removeEventListener(ABRIR_CONVERSAS, abrir);
  }, []);
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5rem-env(safe-area-inset-top))] w-full max-w-[120rem] flex-col gutter lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10">
      <main className="flex min-w-0 flex-1 flex-col lg:order-2" aria-label="Conversa com SINDI">
        <div className="flex w-full max-w-6xl flex-1 flex-col lg:mx-auto">
          {chat.vazia ? (
            <TelaInicial
              sugestoes={chat.sugestoes}
              desabilitada={chat.carregando}
              aoEscolher={(pergunta) => void chat.enviar(pergunta)}
            />
          ) : (
            <ListaDeMensagens
              mensagens={chat.mensagens}
              carregando={chat.carregando}
              fimDaConversa={chat.fimDaConversa}
            />
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {chat.anuncio ? `SINDI respondeu: ${chat.anuncio}` : ''}
          </p>
          <Compositor
            entrada={chat.entrada}
            aoMudar={chat.setEntrada}
            aoEnviar={() => void chat.enviar()}
            aoParar={chat.parar}
            carregando={chat.carregando}
            erro={chat.erro}
            consumoNaoRegistrado={chat.consumoNaoRegistrado}
            restantes={chat.restantes}
            caixaDeTexto={chat.caixaDeTexto}
          />
        </div>
      </main>
      <aside
        aria-label="Conversas anteriores"
        className="no-print hidden pb-6 pt-8 lg:order-1 lg:sticky lg:top-[4.5rem] lg:flex lg:max-h-[calc(100dvh-5.5rem)] lg:flex-col lg:self-start"
      >
        <BarraDeConversas historico={chat.historico} ocupado={chat.carregando} aoNova={chat.comecarNova} />
      </aside>
      <GavetaDeConversas aberta={gavetaAberta} aoFechar={() => setGavetaAberta(false)}>
        <BarraDeConversas
          historico={chat.historico}
          ocupado={chat.carregando}
          aoNova={chat.comecarNova}
          aoEscolher={() => setGavetaAberta(false)}
          prefixo="gaveta-"
        />
      </GavetaDeConversas>
    </div>
  );
}
