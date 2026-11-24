'use client';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { calcularOrcamento, erroDaEntrada, type OrcamentoEntrada } from '@/lib/orcamento/calculo';
import { resumoDoOrcamento } from '@/lib/orcamento/resumo';
import { baixarArquivo } from '@/lib/base/baixar-arquivo';
import { useAcao } from '@/componentes/ui/usar-acao';
import { CATALOGO } from '@/componentes/orcamento/catalogo';
import { corpoDoOrcamento, MARGEM_VAZIA, type MargemEmTexto } from '@/componentes/orcamento/corpo-do-orcamento';
import { metrosDaUrl, postosDaUrl } from '@/componentes/orcamento/postos-da-url';
import { novoPosto, temPostoRepetido, type Posto } from '@/componentes/orcamento/posto';
import { useInsumos } from '@/componentes/orcamento/usar-insumos';
import { useTributosDoOrcamento } from '@/componentes/orcamento/usar-tributos-do-orcamento';

export type TipoDoPdf = 'orcamento' | 'custo';
const NOME_DO_ARQUIVO: Record<TipoDoPdf, string> = {
  orcamento: 'orcamento-terceirizacao.pdf',
  custo: 'relatorio-de-custo.pdf',
};
const CLIENTE_VAZIO = { empresa: '', contato: '', local: '', observacoes: '' };

/** O cálculo roda no navegador com as mesmas bibliotecas do servidor; entrada que a conta recusa não mostra resultado. */
function calcular(entrada: object) {
  try {
    const resultado = calcularOrcamento(entrada as OrcamentoEntrada);
    return resultado.postos.length ? resultado : null;
  } catch {
    return null;
  }
}

/** Pede o PDF ao servidor e o entrega como download; a recusa do servidor vira a mensagem de erro. */
async function baixarPdf(tipo: TipoDoPdf, corpo: object) {
  const resposta = await fetch(`/api/orcamento/pdf?tipo=${tipo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) throw new Error((await resposta.json()).error || 'Não foi possível gerar o PDF.');
  baixarArquivo(await resposta.blob(), NOME_DO_ARQUIVO[tipo]);
}

/** Ações sobre a lista de postos: editar, incluir (sugerindo uma função ainda não usada), remover e carregar o exemplo. */
function useEdicaoDosPostos(setPostos: Dispatch<SetStateAction<Posto[]>>) {
  const atualizarPosto = (chave: number, mudanca: Partial<Posto>) =>
    setPostos((lista) => lista.map((p) => (p.chave === chave ? { ...p, ...mudanca } : p)));
  const adicionarPosto = () =>
    setPostos((lista) => {
      const funcaoLivre = CATALOGO.funcoes.find((f) => !lista.some((p) => p.funcaoId === f.id)) ?? CATALOGO.funcoes[0];
      return [...lista, novoPosto(funcaoLivre.id)];
    });
  const removerPosto = (chave: number) => setPostos((lista) => lista.filter((p) => p.chave !== chave));
  const usarExemplo = () =>
    setPostos([novoPosto('auxiliar-de-limpeza', 3, 'diurno'), novoPosto('auxiliar-de-limpeza', 3, 'noturno')]);
  return { atualizarPosto, adicionarPosto, removerPosto, usarExemplo };
}

/** Estado do formulário de orçamento, o cálculo ao vivo e o download dos PDFs. */
export function useOrcamento() {
  const [postos, setPostos] = useState<Posto[]>([]);
  const [cliente, setCliente] = useState(CLIENTE_VAZIO);
  const [metros, setMetros] = useState('');
  const [iss, setIss] = useState<number | undefined>(undefined);
  // BDI, lucro e tributos começam em branco: a SINDI mostra custo e só aplica o que o usuário informar.
  const [margem, setMargem] = useState<MargemEmTexto>(MARGEM_VAZIA);
  const insumos = useInsumos();
  const tributos = useTributosDoOrcamento();
  const { tributacao } = tributos;
  const pdf = useAcao<TipoDoPdf>('Não foi possível gerar o PDF.');

  // Postos vindos do chat (?postos=...&m2=...) só podem ser lidos no navegador, depois da montagem.
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const inicial = postosDaUrl(parametros, CATALOGO.funcoes);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a URL só existe no navegador; ler depois da hidratação evita divergir do HTML do servidor
    setPostos(inicial.length ? inicial : [novoPosto(CATALOGO.funcoes[0].id)]);
    const metrosDoChat = metrosDaUrl(parametros);
    if (metrosDoChat) setMetros(metrosDoChat);
  }, []);

  const corpo = useMemo(
    () => corpoDoOrcamento(postos, insumos.insumos, metros, iss, margem),
    [postos, insumos.insumos, metros, iss, margem],
  );
  const calculo = useMemo(
    () => (corpo.postos.length ? calcular({ ...corpo, ...(tributacao ? { tributacao } : {}) }) : null),
    [corpo, tributacao],
  );
  // Para comparar, o mesmo orçamento nas regras atuais.
  const comparacao = useMemo(() => (calculo?.tributacao ? calcular(corpo) : null), [calculo, corpo]);
  const resultado = useMemo(() => (calculo ? resumoDoOrcamento(calculo) : null), [calculo]);
  const repetido = useMemo(() => temPostoRepetido(postos), [postos]);
  // Entrada que a conta recusa: a tela diz o motivo (antes mostrava "—" sem explicar, e o PDF recusava com 400).
  const erroDaConta = useMemo(() => erroDaEntrada(corpo as OrcamentoEntrada), [corpo]);

  const edicao = useEdicaoDosPostos(setPostos);
  const mudarCliente = (campo: keyof typeof CLIENTE_VAZIO, valor: string) =>
    setCliente((atual) => ({ ...atual, [campo]: valor }));

  const baixar = (tipo: TipoDoPdf) => {
    if (repetido || erroDaConta) return;
    void pdf.executar(tipo, () => baixarPdf(tipo, { ...corpo, ...(tributacao ? { tributacao } : {}), cliente }));
  };

  return {
    postos,
    ...edicao,
    cliente,
    mudarCliente,
    metros,
    setMetros,
    iss,
    setIss,
    margem,
    setMargem,
    insumos,
    tributos,
    calculo,
    comparacao,
    resultado,
    repetido,
    baixar,
    baixando: pdf.emAndamento,
    erro: erroDaConta ?? pdf.erro,
  };
}
