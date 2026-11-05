'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

const subscribe = (notify: () => void) => {
  window.addEventListener('sindi-theme', notify);
  return () => window.removeEventListener('sindi-theme', notify);
};
const snapshot = () => document.documentElement.dataset.theme === 'dark';
const serverSnapshot = () => false;

export function ThemeToggle({ className = 'flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400' }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sindi-theme');
      const theme = saved === 'dark' || saved === 'light' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      window.dispatchEvent(new Event('sindi-theme'));
    } catch { /* O tema continua funcional sem armazenamento do navegador. */ }
  }, []);
  const label = dark ? 'Ativar tema claro' : 'Ativar tema escuro';
  return <button type="button" aria-label={label} title={label} className={className} onClick={() => {
    const theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sindi-theme', theme); } catch { /* Preferência opcional. */ }
    window.dispatchEvent(new Event('sindi-theme'));
  }}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>;
}
