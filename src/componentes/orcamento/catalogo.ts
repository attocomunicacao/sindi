import { catalogoPublico, type CatalogoPublico } from '@/lib/orcamento/catalogo-publico';

// O catálogo e o cálculo vêm das mesmas bibliotecas do servidor: o resultado aparece na hora, sem ida à rede, e o PDF (gerado no servidor) usa a mesma conta.
// Avaliado uma vez, quando o módulo é importado (no servidor, ao renderizar a página; no navegador, ao carregar o pacote).
export const CATALOGO = catalogoPublico();

export type FuncaoDoCatalogo = CatalogoPublico['funcoes'][number];
