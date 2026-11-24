import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { GrafoCerebro } from '@/componentes/cerebro/grafo-cerebro';

export const metadata = { title: 'Cérebro da SINDI | SINDI' };

const DESCRICAO = 'Tudo o que a SINDI consulta para responder, ligado em rede: os especialistas de cada área, as estantes da biblioteca, o conhecimento '
  + 'escrito pela equipe, os documentos coletados e as leis, normas e projetos que os conectam. É esta rede que o chat percorre para achar as fontes de cada resposta.';

export default function CerebroPage() {
  return <PaginaFerramenta largura="max-w-7xl" espaco="space-y-6" respiro="py-10" titulo="O cérebro da SINDI" larguraDaDescricao="max-w-3xl" descricao={DESCRICAO}>
    <GrafoCerebro />
  </PaginaFerramenta>;
}
