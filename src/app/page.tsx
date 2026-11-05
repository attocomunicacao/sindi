'use client';
import { useEffect, useRef, useState } from 'react';
import { recentMessages } from '@/lib/chat-historico';
import { sortearSugestoes } from '@/lib/sugestoes';
import { ArrowUp, ArrowUpRight, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessage } from '@/components/chat-message';
import { NOVA_CONVERSA } from '@/components/site-header';
type Message = { role: 'user' | 'assistant'; content: string };
export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [metricsWarning, setMetricsWarning] = useState(false);
  // Três perguntas diferentes a cada vez que a tela inicial aparece (ao abrir o chat e ao iniciar uma nova conversa). O sorteio roda no navegador, depois da hidratação.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const busy = useRef(false);
  // Controle da resposta em andamento: o botão Parar (ou Esc) o aborta, o que cancela a leitura no navegador e a geração no servidor.
  const controle = useRef<AbortController | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const empty = messages.length === 0;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sorteio no navegador após a hidratação, para não divergir do HTML do servidor
  useEffect(() => { if (empty) setSuggestions(anteriores => sortearSugestoes(anteriores)); }, [empty]);
  useEffect(() => { if (messages.length) end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages]);
  async function send(text = input) {
    const content = text.trim();
    if (!content || content.length > 1500 || busy.current) return;

    busy.current = true; setLoading(true); setError(''); setInput('');
    const interrupcao = new AbortController(); controle.current = interrupcao; let parcial = '';
    const pending: Message[] = [...messages, { role: 'user', content }];
    setMessages(pending);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ messages: recentMessages(pending) }), signal: AbortSignal.any([interrupcao.signal, AbortSignal.timeout(310000)]) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Não foi possível enviar.'); }
      if (!response.body) throw new Error('A resposta não pôde ser recebida.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = ''; let complete = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop() || '';
          if (done && buffer.trim()) { lines.push(buffer); buffer = ''; }
          for (const line of lines.filter(line => line.trim())) {
            const event = JSON.parse(line);
            if (event.type === 'error') throw new Error(event.error || 'A resposta foi interrompida.');
            if (event.type === 'reset') { answer = ''; parcial = ''; setMessages([...pending, { role: 'assistant', content: '' }]); }
            if (event.type === 'delta') { answer += event.text; parcial = answer; setMessages([...pending, { role: 'assistant', content: answer }]); }
            if (event.type === 'done') { complete = true; setMetricsWarning(event.metricsRecorded === false); setMessages([...pending, { role: 'assistant', content: event.text }]); }
          }
          if (done) break;
        }
        if (!complete) throw new Error('A resposta foi interrompida. Tente novamente.');
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (cause) {
      // Interrompida por quem enviou: se já havia texto, ele fica; se nada tinha chegado, a pergunta volta para a caixa de texto, para editar ou descartar.
      if (interrupcao.signal.aborted) { if (parcial.trim()) setMessages([...pending, { role: 'assistant', content: parcial }]); else { setMessages(messages); setInput(content); } return; }
      setMessages(messages); setInput(content); setError(cause instanceof Error ? ['TimeoutError', 'AbortError'].includes(cause.name) ? 'O modelo local demorou para responder. Tente novamente em instantes.' : cause.message : 'Tente novamente.'); }
    finally { busy.current = false; controle.current = null; setLoading(false); textarea.current?.focus({ preventScroll: true }); }
  }
  const parar = () => controle.current?.abort();
  useEffect(() => {
    if (!loading) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') controle.current?.abort(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [loading]);
  useEffect(() => {
    const limpar = () => { if (busy.current) return; setMessages([]); setError(''); setInput(''); textarea.current?.focus({ preventScroll: true }); };
    window.addEventListener(NOVA_CONVERSA, limpar);
    return () => window.removeEventListener(NOVA_CONVERSA, limpar);
  }, []);
  return <div className="flex min-h-[calc(100dvh-7rem-env(safe-area-inset-top))] flex-col">
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gutter" aria-label="Conversa com SINDI"><div className="flex w-full max-w-3xl flex-1 flex-col">
      {empty ? <div className="anim-rise flex flex-1 flex-col justify-center pb-10 pt-12 baixo:pb-6 baixo:pt-6">
        <span className="mb-6 block h-1 w-10 rounded-full bg-amber-400" aria-hidden />
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">SINDI</h1>
        <p className="mt-3 text-lg text-slate-500">Assistente virtual do SINDEPRESTEM.</p>
        <ul className="mt-10 divide-y divide-slate-200 border-y border-slate-200">{suggestions.map(s => <li key={s}><button disabled={loading} onClick={() => void send(s)} className="group flex w-full items-center justify-between gap-4 py-4 text-left text-base text-slate-700 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400">{s}<ArrowUpRight size={16} className="shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-amber-600" /></button></li>)}</ul>
      </div> : <div className="flex-1 space-y-8 pb-8 pt-8" role="log" aria-live="polite" aria-relevant="additions">
        {messages.map((message, i) => message.role === 'user'
          ? <div key={i} className="msg-in flex justify-end"><p className="sr-only">Você</p><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-900">{message.content}</div></div>
          : <div key={i} className="msg-in flex gap-4"><span className="mt-1 h-5 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden /><div className="min-w-0 flex-1 text-slate-800"><p className="sr-only">SINDI</p><ChatMessage content={message.content} /></div></div>)}
        {loading && messages.at(-1)?.role === 'user' && <div className="flex items-center gap-1.5 pl-5" role="status" aria-label="Preparando resposta"><span className="dot" /><span className="dot" /><span className="dot" /></div>}
        <div ref={end} />
      </div>}
      <div className="no-print sticky bottom-0 bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {error && <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}
        {metricsWarning && <p role="status" className="mb-3 text-xs text-amber-800">O consumo desta resposta não pôde ser registrado.</p>}
        <form onSubmit={e => { e.preventDefault(); void send(); }} className="flex items-end gap-2 rounded-xl border border-slate-300 bg-surface p-2 shadow-sm focus-within:border-amber-400 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-amber-400)_25%,transparent)]">
          <label htmlFor="message" className="sr-only">Mensagem para SINDI</label>
          <textarea ref={textarea} id="message" placeholder="Pergunte à SINDI" value={input} maxLength={1500} disabled={loading} rows={1} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} className="max-h-40 min-h-10 flex-1 bg-transparent px-3 py-2 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 [field-sizing:content]" />
          {loading
            ? <Button type="button" size="icon" variant="outline" aria-label="Parar resposta" title="Parar resposta (Esc)" onClick={parar}><Square size={14} fill="currentColor" /></Button>
            : <Button type="submit" size="icon" aria-label="Enviar" disabled={!input.trim()}><ArrowUp size={17} /></Button>}
        </form>
        <p className="mt-2.5 text-center text-xs text-slate-500 baixo:mt-1.5">A IA pode errar. Não envie dados confidenciais.</p>
      </div>
    </div></main>
  </div>;
}
