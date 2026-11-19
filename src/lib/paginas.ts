// Sem dependências: usado por componentes do navegador (cabeçalho, marca) e pelo servidor (robots, 404).
/**
 * Registro das páginas do site. Para acrescentar uma página:
 *  1. criar `src/app/<rota>/page.tsx` com `metadata`;
 *  2. incluí-la aqui (o cabeçalho, o menu, o robots e a marca leem desta lista);
 *  3. desenhar o glifo dela em `GLIFOS` (src/components/sindi-mark.tsx): o TypeScript não compila sem ele.
 */
export const PAGINAS = [
  { id: 'inicio', rota: '/', rotulo: 'Início', previa: true },
  { id: 'painel', rota: '/painel', rotulo: 'Painel do setor', previa: true },
  { id: 'orcamento', rota: '/orcamento', rotulo: 'Orçamento', previa: true },
  { id: 'base', rota: '/base', rotulo: 'Biblioteca', previa: false },
  { id: 'uso', rota: '/uso', rotulo: 'Uso', previa: false },
] as const;
export type Pagina = (typeof PAGINAS)[number]['id'];

/** Página a que um caminho pertence (`/base/documento/3` é "base"); qualquer outro é "inicio". */
export function paginaDe(caminho: string): Pagina {
  return PAGINAS.find(p => p.id !== 'inicio' && (caminho === p.rota || caminho.startsWith(`${p.rota}/`)))?.id ?? 'inicio';
}
export const rotaDe = (id: Pagina) => PAGINAS.find(p => p.id === id)!.rota;
/** Páginas cuja prévia de link (WhatsApp, redes sociais) é permitida; as demais ficam fora para esses rastreadores. */
export const rotasSemPrevia = () => PAGINAS.filter(p => !p.previa).map(p => p.rota);
