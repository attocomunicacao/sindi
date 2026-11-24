'use client';
import { useEffect, type RefObject } from 'react';

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo aberto (gaveta, menu): leva o foco para dentro, mantém o Tab e o Shift+Tab circulando entre os itens do diálogo e, ao fechar, devolve o foco ao
 * elemento que o abriu. Sem biblioteca: é o comportamento mínimo que o padrão WAI-ARIA de diálogo modal pede.
 */
export function useArmadilhaDeFoco(ativo: boolean, caixa: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const raiz = caixa.current;
    if (!ativo || !raiz) return;
    const origem = document.activeElement as HTMLElement | null;
    const itens = () => [...raiz.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((el) => el.offsetParent !== null);
    (itens()[0] ?? raiz).focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const lista = itens();
      if (!lista.length) return e.preventDefault();
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (!raiz.contains(document.activeElement)) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      if (origem?.isConnected) origem.focus({ preventScroll: true });
    };
  }, [ativo, caixa]);
}
