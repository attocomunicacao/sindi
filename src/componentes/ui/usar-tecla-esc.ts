'use client';
import { useEffect, useRef } from 'react';

/** Chama `aoPressionar` quando a tecla Esc é pressionada, enquanto `ativo` (diálogo aberto, menu aberto, resposta em andamento). */
export function useTeclaEsc(ativo: boolean, aoPressionar: () => void) {
  const ultimo = useRef(aoPressionar);
  useEffect(() => { ultimo.current = aoPressionar; });
  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') ultimo.current(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo]);
}
