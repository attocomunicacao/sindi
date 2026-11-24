import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { GrafoCerebro } from '@/componentes/cerebro/grafo-cerebro';

export const metadata = { title: 'Cérebro da SINDI | SINDI' };

const DESCRICAO = 'Tudo o que a SINDI consulta para responder, ligado em rede.';

export default function CerebroPage() {
  return <PaginaFerramenta largura="max-w-[120rem]" espaco="space-y-6" respiro="py-10" titulo="O cérebro da SINDI" larguraDaDescricao="max-w-3xl" descricao={DESCRICAO}>
    {/* O detalhe fica recolhido: a página abre direto no grafo. */}
    <details className="max-w-3xl text-sm leading-6 text-slate-600">
      <summary className="cursor-pointer select-none font-medium text-slate-800">Como ler este mapa</summary>
      <p className="mt-2">Estão ligados os especialistas de cada área, as estantes da biblioteca, o conhecimento escrito pela equipe, os documentos coletados e as leis, normas e projetos que os conectam. É esta rede que o chat percorre para achar as fontes de cada resposta.</p>
    </details>
    <GrafoCerebro />
  </PaginaFerramenta>;
}
