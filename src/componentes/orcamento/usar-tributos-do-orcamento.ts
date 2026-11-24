'use client';
import { useMemo, useState } from 'react';
import { tributacaoDoFormulario, type ModoTributacao, type SimplesEmTexto } from '@/lib/orcamento/tributacao-do-formulario';
import { aliquotasEmTexto } from '@/lib/tributos/formulario';

/** Escolhas da seção "Tributos" e a tributação que delas resulta (`pendente` explica por que a escolha ainda não vale). */
export function useTributosDoOrcamento() {
  const [modo, setModo] = useState<ModoTributacao>('atual');
  const [anoDaReforma, setAnoDaReforma] = useState(2026);
  const [aliquotas, setAliquotas] = useState(aliquotasEmTexto(2027));
  const [simples, setSimples] = useState<SimplesEmTexto>({ anexo: 'IV', rbt12: '', folha12: '', ano: 2026, pCBS: '', pIBS: '' });

  // Ao trocar o ano da Reforma, as alíquotas editáveis voltam às estimadas do ano novo (de 2027 em diante).
  const escolherAnoDaReforma = (ano: number) => {
    setAnoDaReforma(ano);
    if (ano >= 2027) setAliquotas(aliquotasEmTexto(ano));
  };
  const { tributacao, pendente } = useMemo(() => tributacaoDoFormulario(modo, anoDaReforma, aliquotas, simples), [modo, anoDaReforma, aliquotas, simples]);

  return { modo, setModo, anoDaReforma, escolherAnoDaReforma, aliquotas, setAliquotas, simples, setSimples, tributacao, pendente };
}
