'use client';
import { useEffect, useState } from 'react';
import type { Painel } from '@/lib/dados/painel';

const CINCO_MINUTOS_MS = 5 * 60 * 1000;

/** Estado do painel: os dados, se a última tentativa falhou e como tentar de novo. Pausa a coleta com a aba oculta e atualiza ao voltar. */
export function usePainel(intervaloMs = CINCO_MINUTOS_MS) {
  const [dados, setDados] = useState<Painel | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const resposta = await fetch('/api/painel', { cache: 'no-store' });
        if (!resposta.ok) throw new Error('painel');
        const lidos = await resposta.json();
        if (ativo) {
          setDados(lidos);
          setFalhou(false);
        }
      } catch {
        if (ativo) setFalhou(true);
      }
    };
    const carregarSeVisivel = () => {
      if (!document.hidden) void carregar();
    };
    void carregar();
    const relogio = setInterval(carregarSeVisivel, intervaloMs);
    document.addEventListener('visibilitychange', carregarSeVisivel);
    return () => {
      ativo = false;
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', carregarSeVisivel);
    };
  }, [intervaloMs, tentativa]);
  return { dados, falhou, recarregar: () => setTentativa((n) => n + 1) };
}
