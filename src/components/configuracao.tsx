'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Settings, X } from 'lucide-react';

type Estado = { permitido: boolean; rodando?: boolean; completa?: boolean; inicio?: string; fim?: string; codigo?: number | null; linhas?: string[] };
const hora = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

/** Botão de configuração: atualiza as bibliotecas (notícias, leis, relatórios, dados do setor). Só aparece no computador que hospeda a SINDI. */
export function Configuracao({ className }: { className: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ler = useCallback(async () => {
    try { setEstado(await (await fetch('/api/atualizar', { cache: 'no-store' })).json()); } catch { /* mantém o último estado */ }
  }, []);
  useEffect(() => {
    let vivo = true;
    fetch('/api/atualizar', { cache: 'no-store' }).then(r => r.json()).then(d => { if (vivo) setEstado(d); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    if (!aberto || !estado?.rodando) return;
    timer.current = setTimeout(() => void ler(), 2000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [aberto, estado, ler]);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto]);
  if (!estado?.permitido) return null;
  async function iniciar(completa: boolean) {
    setErro('');
    const r = await fetch('/api/atualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completa }) }).catch(() => null);
    if (!r) return setErro('Não foi possível falar com o servidor.');
    const dados = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 409) setErro(dados.error ?? 'Não foi possível iniciar.');
    void ler();
  }
  const botao = 'inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50';
  return <>
    <button type="button" aria-label="Configuração" title="Configuração" onClick={() => setAberto(true)} className={className}><Settings size={16} /></button>
    {aberto && <div role="dialog" aria-modal="true" aria-label="Configuração" className="fixed inset-0 z-30 flex items-start justify-center bg-slate-900/30 p-4 pt-20" onClick={() => setAberto(false)}>
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-surface p-5 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-medium">Configuração</h2><button type="button" aria-label="Fechar" onClick={() => setAberto(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
        <p className="mt-2 text-sm text-slate-600">Atualiza todas as bibliotecas: notícias e artigos do sindicato, legislação, convenções, relatórios e dados do setor. Depois reconstrói o resumo e o índice de busca da SINDI.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={botao} disabled={estado.rodando} onClick={() => void iniciar(false)}>{estado.rodando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}Atualizar tudo</button>
          <button type="button" className={botao} disabled={estado.rodando} onClick={() => void iniciar(true)} title="Refaz a coleta do zero; pode demorar bastante">Atualização completa</button>
        </div>
        {erro && <p role="alert" className="mt-3 text-sm text-red-600">{erro}</p>}
        <p className="mt-4 text-xs text-slate-500" aria-live="polite">
          {estado.rodando ? `Em andamento desde ${hora(estado.inicio)}${estado.completa ? ' (completa)' : ''}…` : estado.fim ? `Última atualização: ${hora(estado.fim)} — ${estado.codigo === 0 ? 'concluída' : 'terminou com erro'}.` : 'Nenhuma atualização nesta sessão do servidor.'}
        </p>
        {!!estado.linhas?.length && <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-100 p-2 text-xs whitespace-pre-wrap">{estado.linhas.slice(-12).join('\n')}</pre>}
      </div>
    </div>}
  </>;
}
