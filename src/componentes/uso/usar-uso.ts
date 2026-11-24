'use client';
import { useEffect, useState } from 'react';
import type { DiaDeUso } from '@/lib/infra/uso';

export type Uso = { days: DiaDeUso[]; storage: string; available: boolean };

const MENSAGEM_DE_FALHA = 'Não foi possível carregar o uso. Tente atualizar.';

/** Carrega as métricas de uso (só agregados) ao abrir a página e quando pedido; `erro` fica vazio enquanto tudo vai bem. */
export function useUso() {
  const [dados, setDados] = useState<Uso>();
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function atualizar() {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await fetch('/api/uso', { cache: 'no-store' });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error);
      setDados(corpo);
    } catch {
      setErro(MENSAGEM_DE_FALHA);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const controle = new AbortController();
    fetch('/api/uso', { cache: 'no-store', signal: controle.signal })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        setDados(await resposta.json());
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setErro(MENSAGEM_DE_FALHA);
      });
    return () => controle.abort();
  }, []);

  return { dados, erro, carregando, atualizar };
}
