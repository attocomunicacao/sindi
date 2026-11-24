'use client';
import { useState } from 'react';

/**
 * Ação assíncrona disparada pelo usuário (gerar um PDF, por exemplo): guarda qual está em andamento e a mensagem de erro.
 * `executar` limpa o erro anterior, roda a tarefa e devolve se ela terminou sem falha; qualquer falha vira `erro` (a mensagem da falha, ou a padrão).
 */
export function useAcao<Chave extends string = string>(mensagemPadrao: string) {
  const [erro, setErro] = useState('');
  const [emAndamento, setEmAndamento] = useState<Chave | null>(null);
  async function executar(chave: Chave, tarefa: () => Promise<void>) {
    setEmAndamento(chave);
    setErro('');
    try {
      await tarefa();
      return true;
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : mensagemPadrao);
      return false;
    } finally {
      setEmAndamento(null);
    }
  }
  return { erro, setErro, emAndamento, executar };
}
