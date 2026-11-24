'use client';
import { useChat } from '@/componentes/chat/usar-chat';
import { TelaInicial } from '@/componentes/chat/tela-inicial';
import { ListaDeMensagens } from '@/componentes/chat/lista-de-mensagens';
import { Compositor } from '@/componentes/chat/compositor';

/** A página do chat: tela de abertura enquanto não há mensagens, depois a conversa, sempre com o compositor no rodapé. */
export function Conversa() {
  const chat = useChat();
  return <div className="flex min-h-[calc(100dvh-7rem-env(safe-area-inset-top))] flex-col">
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gutter" aria-label="Conversa com SINDI">
      <div className="flex w-full max-w-3xl flex-1 flex-col">
        {chat.vazia
          ? <TelaInicial sugestoes={chat.sugestoes} desabilitada={chat.carregando} aoEscolher={pergunta => void chat.enviar(pergunta)} />
          : <ListaDeMensagens mensagens={chat.mensagens} carregando={chat.carregando} fimDaConversa={chat.fimDaConversa} />}
        <p className="sr-only" role="status" aria-live="polite">{chat.anuncio ? `SINDI respondeu: ${chat.anuncio}` : ''}</p>
        <Compositor entrada={chat.entrada} aoMudar={chat.setEntrada} aoEnviar={() => void chat.enviar()} aoParar={chat.parar}
          carregando={chat.carregando} erro={chat.erro} consumoNaoRegistrado={chat.consumoNaoRegistrado} restantes={chat.restantes} caixaDeTexto={chat.caixaDeTexto} />
      </div>
    </main>
  </div>;
}
