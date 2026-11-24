import { brl } from '@/lib/base/formato';
import { Botao } from '@/componentes/ui/botao';
import { CampoDeTexto } from '@/componentes/ui/campo';
import { Seletor } from '@/componentes/ui/seletor';
import { CATALOGO } from '@/componentes/orcamento/catalogo';
import { Opcional, TituloDaSecao } from '@/componentes/orcamento/titulo-da-secao';
import type { useInsumos } from '@/componentes/orcamento/usar-insumos';

/** Seção 03: materiais, equipamentos e serviços acrescentados ao orçamento. */
export function SecaoInsumos({ insumos }: { insumos: ReturnType<typeof useInsumos> }) {
  const { categoria } = insumos;
  return (
    <section aria-labelledby="insumos" className="space-y-4">
      <TituloDaSecao id="insumos" numero="03">
        Materiais, equipamentos e serviços <Opcional>(opcional)</Opcional>
      </TituloDaSecao>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px_auto] sm:items-end">
        <Seletor id="cat" rotulo="Categoria" value={insumos.categoriaId} aoMudar={insumos.escolherCategoria}>
          <option value="">Escolha…</option>
          {CATALOGO.categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.titulo}
            </option>
          ))}
        </Seletor>
        <Seletor id="item" rotulo="Item" value={insumos.itemId} disabled={!categoria} aoMudar={insumos.setItemId}>
          <option value="">Escolha…</option>
          {categoria?.itens.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome} — {brl(i.valor)}
            </option>
          ))}
        </Seletor>
        <CampoDeTexto
          id="qi"
          rotulo="Qtde"
          type="number"
          min={1}
          value={insumos.quantidade}
          aoMudar={insumos.setQuantidade}
        />
        <Botao type="button" variante="contorno" disabled={!insumos.podeIncluir} onClick={insumos.incluir}>
          Incluir
        </Botao>
      </div>
      {insumos.insumos.length > 0 && (
        <ul className="divide-y divide-slate-200 border-y border-slate-200 text-sm">
          {insumos.insumos.map((i) => (
            <li key={i.categoria + i.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                {i.quantidade} × {insumos.nomeDe(i)}
              </span>
              <button
                type="button"
                onClick={() => insumos.remover(i)}
                className="text-xs text-slate-500 hover:text-red-700"
                aria-label={`Remover ${insumos.nomeDe(i)}`}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
