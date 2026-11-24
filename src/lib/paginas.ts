// Sem dependências: usado por componentes do navegador (cabeçalho, marca) e pelo servidor (robots, 404).
/**
 * Registro das páginas do site. Para acrescentar uma página:
 *  1. criar `src/app/<rota>/page.tsx` com `metadata`;
 *  2. incluí-la aqui (o cabeçalho, o menu, o robots e a marca leem desta lista);
 *  3. desenhar o glifo dela em `GLIFOS` (src/componentes/layout/marca-sindi.tsx): o TypeScript não compila sem ele.
 * `menu: false` deixa a página fora do cabeçalho (acesso só pelo endereço); `previa: false` a tira das prévias de link.
 */
export const PAGINAS = [
  { id: 'inicio', rota: '/', rotulo: 'Início', previa: true, menu: true },
  { id: 'painel', rota: '/painel', rotulo: 'Painel do setor', previa: true, menu: true },
  { id: 'orcamento', rota: '/orcamento', rotulo: 'Orçamento', previa: true, menu: true },
  { id: 'tributos', rota: '/tributos', rotulo: 'Tributos', previa: true, menu: true },
  { id: 'base', rota: '/base', rotulo: 'Biblioteca', previa: false, menu: true },
  { id: 'cerebro', rota: '/cerebro', rotulo: 'Cérebro', previa: false, menu: true },
  { id: 'uso', rota: '/uso', rotulo: 'Uso', previa: false, menu: true },
  // Comercial (apresentação ao sindicato): só pelo endereço.
  { id: 'custos', rota: '/custos', rotulo: 'Custos', previa: false, menu: false },
  // Gerador do DANFSe (porte do projeto da Receita Federal): aberto pela calculadora de tributos.
  { id: 'danfse', rota: '/danfse', rotulo: 'DANFSe', previa: false, menu: false },
] as const;
export type Pagina = (typeof PAGINAS)[number]['id'];

/** Página a que um caminho pertence (`/base/documento/3` é "base"); qualquer outro é "inicio". */
export function paginaDe(caminho: string): Pagina {
  return (
    PAGINAS.find((p) => p.id !== 'inicio' && (caminho === p.rota || caminho.startsWith(`${p.rota}/`)))?.id ?? 'inicio'
  );
}
export const rotaDe = (id: Pagina) => PAGINAS.find((p) => p.id === id)!.rota;
/** Páginas cuja prévia de link (WhatsApp, redes sociais) é permitida; as demais ficam fora para esses rastreadores. */
export const rotasSemPrevia = () => PAGINAS.filter((p) => !p.previa).map((p) => p.rota);
/** Páginas que aparecem no menu do cabeçalho. */
export const paginasDoMenu = () => PAGINAS.filter((p) => p.menu);
