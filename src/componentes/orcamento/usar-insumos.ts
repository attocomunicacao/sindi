'use client';
import { useState } from 'react';
import { CATALOGO } from '@/componentes/orcamento/catalogo';
import type { Insumo } from '@/componentes/orcamento/posto';

/** Insumos (materiais, equipamentos e serviços) do orçamento e o seletor de "categoria, item, quantidade" que os inclui. */
export function useInsumos() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [categoriaId, setCategoriaId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const categoria = CATALOGO.categorias.find(c => c.id === categoriaId);

  const escolherCategoria = (id: string) => { setCategoriaId(id); setItemId(''); };
  const podeIncluir = Boolean(categoria) && itemId !== '' && Number(quantidade) > 0;
  // Incluir o mesmo item de novo troca a quantidade em vez de duplicar a linha.
  const incluir = () => {
    setInsumos(lista => [...lista.filter(i => !(i.categoria === categoriaId && i.id === itemId)), { categoria: categoriaId, id: itemId, quantidade: Number(quantidade) }]);
    setItemId('');
  };
  const remover = (insumo: Insumo) => setInsumos(lista => lista.filter(i => i !== insumo));
  const nomeDe = (insumo: Insumo) => CATALOGO.categorias.find(c => c.id === insumo.categoria)?.itens.find(i => i.id === insumo.id)?.nome ?? insumo.id;

  return { insumos, categoria, categoriaId, escolherCategoria, itemId, setItemId, quantidade, setQuantidade, podeIncluir, incluir, remover, nomeDe };
}
