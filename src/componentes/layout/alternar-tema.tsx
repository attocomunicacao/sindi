'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

const EVENTO_DO_TEMA = 'sindi-theme';
const CHAVE_DO_TEMA = 'sindi-theme';

const assinar = (avisar: () => void) => {
  window.addEventListener(EVENTO_DO_TEMA, avisar);
  return () => window.removeEventListener(EVENTO_DO_TEMA, avisar);
};
const temaEscuroAtivo = () => document.documentElement.dataset.theme === 'dark';
const temaEscuroNoServidor = () => false;

/** Tema salvo; sem preferência salva, vale o do sistema. */
function temaInicial() {
  const salvo = localStorage.getItem(CHAVE_DO_TEMA);
  if (salvo === 'dark' || salvo === 'light') return salvo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AlternarTema({ className = 'flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400' }: { className?: string }) {
  const escuro = useSyncExternalStore(assinar, temaEscuroAtivo, temaEscuroNoServidor);
  useEffect(() => {
    try {
      document.documentElement.dataset.theme = temaInicial();
      window.dispatchEvent(new Event(EVENTO_DO_TEMA));
    } catch { /* O tema continua funcional sem armazenamento do navegador. */ }
  }, []);
  const rotulo = escuro ? 'Ativar tema claro' : 'Ativar tema escuro';
  const alternar = () => {
    const tema = escuro ? 'light' : 'dark';
    document.documentElement.dataset.theme = tema;
    try { localStorage.setItem(CHAVE_DO_TEMA, tema); } catch { /* Preferência opcional. */ }
    window.dispatchEvent(new Event(EVENTO_DO_TEMA));
  };
  return <button type="button" aria-label={rotulo} title={rotulo} className={className} onClick={alternar}>{escuro ? <Sun size={17} /> : <Moon size={17} />}</button>;
}
