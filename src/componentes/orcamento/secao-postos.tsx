import { Plus } from 'lucide-react';
import type { Resultado } from '@/lib/orcamento/calculo';
import { Botao } from '@/componentes/ui/botao';
import { CATALOGO } from '@/componentes/orcamento/catalogo';
import { PostoDeTrabalho } from '@/componentes/orcamento/posto-de-trabalho';
import type { Posto } from '@/componentes/orcamento/posto';
import { TituloDaSecao } from '@/componentes/orcamento/titulo-da-secao';

type PropsDaSecaoPostos = {
  postos: Posto[]; calculo: Resultado | null;
  aoAtualizar: (chave: number, mudanca: Partial<Posto>) => void; aoRemover: (chave: number) => void; aoAdicionar: () => void; aoUsarExemplo: () => void;
};

/** Seção 02: os postos de trabalho, com os botões para acrescentar um posto ou carregar o exemplo. */
export function SecaoPostos({ postos, calculo, aoAtualizar, aoRemover, aoAdicionar, aoUsarExemplo }: PropsDaSecaoPostos) {
  return <section aria-labelledby="postos" className="space-y-4">
    <TituloDaSecao id="postos" numero="02">Postos de trabalho</TituloDaSecao>
    {postos.map((posto, indice) => <PostoDeTrabalho key={posto.chave} posto={posto} numero={indice + 1} podeRemover={postos.length > 1}
      conta={calculo?.postos[indice]} aoAtualizar={aoAtualizar} aoRemover={aoRemover} />)}
    <div className="flex flex-wrap gap-2">
      <Botao type="button" variante="contorno" onClick={aoAdicionar}><Plus size={16} aria-hidden /> Adicionar posto</Botao>
      <Botao type="button" variante="contorno" onClick={aoUsarExemplo}>Exemplo: 3 auxiliares de limpeza diurno + 3 noturno</Botao>
    </div>
    {CATALOGO.sobConsulta.length > 0 && <p className="text-xs text-slate-500">Sob consulta (sem salário na tabela de referência): {CATALOGO.sobConsulta.map(n => n.toLowerCase()).join(', ')}.</p>}
  </section>;
}
