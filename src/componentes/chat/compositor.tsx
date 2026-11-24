import type { Ref } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { AvisoEmCaixa } from '@/componentes/ui/aviso';
import { LIMITE_DA_PERGUNTA } from '@/componentes/chat/pedir-resposta';

type PropsDoCompositor = {
  entrada: string; aoMudar: (texto: string) => void; aoEnviar: () => void; aoParar: () => void;
  carregando: boolean; erro: string; consumoNaoRegistrado: boolean; restantes: number | null;
  caixaDeTexto: Ref<HTMLTextAreaElement>;
};

function textoDoSaldo(restantes: number | null) {
  return restantes === null ? '' : ` Restam ${restantes} ${restantes === 1 ? 'mensagem' : 'mensagens'} hoje.`;
}

/** Rodapé fixo do chat: avisos, caixa de mensagem com enviar/parar e a nota sobre o uso de IA externa. */
export function Compositor({ entrada, aoMudar, aoEnviar, aoParar, carregando, erro, consumoNaoRegistrado, restantes, caixaDeTexto }: PropsDoCompositor) {
  return <div className="no-print sticky bottom-0 bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
    {erro && <AvisoEmCaixa role="alert" className="mb-3">{erro}</AvisoEmCaixa>}
    {consumoNaoRegistrado && <p role="status" className="mb-3 text-xs text-amber-800">O consumo desta resposta não pôde ser registrado.</p>}
    <form onSubmit={e => { e.preventDefault(); aoEnviar(); }} className="flex items-end gap-2 rounded-xl border border-slate-300 bg-surface p-2 shadow-sm focus-within:border-amber-400 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-amber-400)_25%,transparent)]">
      <label htmlFor="message" className="sr-only">Mensagem para SINDI</label>
      <textarea ref={caixaDeTexto} id="message" placeholder="Pergunte à SINDI" value={entrada} maxLength={LIMITE_DA_PERGUNTA} disabled={carregando} rows={1}
        onChange={e => aoMudar(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); aoEnviar(); } }}
        className="max-h-40 min-h-10 flex-1 bg-transparent px-3 py-2 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 [field-sizing:content]" />
      {carregando
        ? <Botao type="button" tamanho="icone" variante="contorno" aria-label="Parar resposta" title="Parar resposta (Esc)" onClick={aoParar}><Square size={14} fill="currentColor" /></Botao>
        : <Botao type="submit" tamanho="icone" aria-label="Enviar" disabled={!entrada.trim()}><ArrowUp size={17} /></Botao>}
    </form>
    <p className="mt-2.5 text-center text-xs text-slate-500 baixo:mt-1.5">A IA pode errar. Não envie dados pessoais nem confidenciais: as perguntas passam por serviços de IA externos gratuitos, que podem usá-las para melhorar seus produtos.{textoDoSaldo(restantes)}</p>
  </div>;
}
