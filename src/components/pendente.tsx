'use client';
import { createPortal } from 'react-dom';
import { useLinkStatus } from 'next/link';

/**
 * Barra fina no topo da janela enquanto a navegação de um <Link> está pendente (vai dentro do próprio Link). Substitui o loading.tsx da raiz:
 * um fallback de Suspense acima das páginas começaria a enviar a resposta antes delas, fixando o status 200 mesmo em 404 e 500.
 * Vai para o <body> por portal: transform (anim-rise) e backdrop-filter (cabeçalho) dos ancestrais prenderiam um elemento "fixed" a eles.
 * Só existe enquanto há navegação pendente (no servidor, nunca), e aparece após 150 ms, como o antigo carregamento, para não piscar.
 */
export function Pendente() {
  const { pending } = useLinkStatus();
  return pending ? createPortal(<span aria-hidden className="barra-navegacao" />, document.body) : null;
}
