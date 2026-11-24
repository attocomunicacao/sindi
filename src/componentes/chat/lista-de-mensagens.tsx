import type { Ref } from 'react';
import { MensagemDoChat } from '@/componentes/chat/mensagem-do-chat';
import type { MensagemDaConversa } from '@/componentes/chat/pedir-resposta';

function MensagemDoUsuario({ conteudo }: { conteudo: string }) {
  return (
    <div className="msg-in flex justify-end">
      <p className="sr-only">Você</p>
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-900">
        {conteudo}
      </div>
    </div>
  );
}

function MensagemDaSindi({ conteudo }: { conteudo: string }) {
  return (
    <div className="msg-in flex gap-4">
      <span className="mt-1 h-5 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden />
      <div className="min-w-0 flex-1 text-slate-800">
        <p className="sr-only">SINDI</p>
        <MensagemDoChat conteudo={conteudo} />
      </div>
    </div>
  );
}

/** Indicador de "preparando resposta" (três pontos) enquanto a pergunta ainda não recebeu nenhum trecho. */
function PreparandoResposta() {
  return (
    <div className="flex items-center gap-1.5 pl-5" role="status" aria-label="Preparando resposta">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  );
}

type PropsDaLista = { mensagens: MensagemDaConversa[]; carregando: boolean; fimDaConversa: Ref<HTMLDivElement> };

/** A conversa em andamento; `fimDaConversa` marca o ponto até onde a tela rola para acompanhar a resposta. */
export function ListaDeMensagens({ mensagens, carregando, fimDaConversa }: PropsDaLista) {
  return (
    <div className="flex-1 space-y-8 pb-8 pt-8" role="region" aria-label="Mensagens da conversa">
      {mensagens.map((mensagem, i) =>
        mensagem.role === 'user' ? (
          <MensagemDoUsuario key={i} conteudo={mensagem.content} />
        ) : (
          <MensagemDaSindi key={i} conteudo={mensagem.content} />
        ),
      )}
      {carregando && mensagens.at(-1)?.role === 'user' && <PreparandoResposta />}
      <div ref={fimDaConversa} />
    </div>
  );
}
