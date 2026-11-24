'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { baixarArquivo } from '@/lib/base/baixar-arquivo';
import {
  apagarTodasAsConversas,
  definirPausaDoHistorico,
  excluirConversa,
  historicoDisponivel,
  historicoPausado,
  importarConversas,
  listarConversas,
  mensagensParaGuardar,
  novoId,
  podarConversas,
  salvarConversa,
  serializarConversas,
  tituloDaConversa,
  type ConversaSalva,
} from '@/componentes/chat/historico-local';
import type { MensagemDaConversa } from '@/componentes/chat/pedir-resposta';

type Entrada = {
  mensagens: MensagemDaConversa[];
  carregando: boolean;
  /** Mostra uma conversa guardada na tela do chat. */
  aoAbrir: (mensagens: MensagemDaConversa[]) => void;
  /** Esvazia o chat (a conversa aberta foi excluída). */
  aoLimpar: () => void;
};

/**
 * Conversas anteriores, só neste navegador: guarda a conversa quando a resposta termina (com dados pessoais já removidos), lista, abre, renomeia, fixa,
 * exclui, pausa, apaga tudo, exporta e importa. Nada é enviado ao servidor.
 */
export function useHistorico({ mensagens, carregando, aoAbrir, aoLimpar }: Entrada) {
  const [conversas, setConversas] = useState<ConversaSalva[]>([]);
  const [atualId, setAtualId] = useState<string>();
  const [pausado, setPausado] = useState(false);
  const [disponivel, setDisponivel] = useState(true);
  const [aviso, setAviso] = useState('');
  // O que já foi guardado (id + conteúdo), para não regravar a mesma conversa nem "subir" na lista só por ser aberta.
  const guardado = useRef('');
  const lista = useRef(conversas);
  useEffect(() => {
    lista.current = conversas;
  });

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o armazenamento só existe no navegador; ler depois da hidratação evita divergir do HTML do servidor
    setPausado(historicoPausado());
    void Promise.all([listarConversas(), historicoDisponivel()]).then(([guardadas, ok]) => {
      if (!vivo) return;
      setConversas(guardadas);
      setDisponivel(ok);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Quando a resposta termina, guarda (ou atualiza) a conversa.
  useEffect(() => {
    if (carregando || pausado || !disponivel || mensagens.length < 2 || mensagens.at(-1)?.role !== 'assistant') return;
    const limpas = mensagensParaGuardar(mensagens);
    if (limpas.length < 2) return;
    const id = atualId ?? novoId();
    const assinatura = `${id}|${limpas.length}|${limpas.at(-1)!.content}`;
    if (guardado.current === assinatura) return;
    guardado.current = assinatura;
    const existente = lista.current.find((c) => c.id === id);
    const agora = Date.now();
    const conversa: ConversaSalva = {
      id,
      titulo: existente?.tituloManual ? existente.titulo : tituloDaConversa(limpas),
      ...(existente?.tituloManual ? { tituloManual: true } : {}),
      ...(existente?.fixada ? { fixada: true } : {}),
      criadaEm: existente?.criadaEm ?? agora,
      atualizadaEm: agora,
      mensagens: limpas,
    };
    // Guardar é sincronizar com o armazenamento do navegador (um sistema externo): o estado da lista e o id da conversa acompanham o que foi guardado.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver o comentário acima
    if (!atualId) setAtualId(id);
    setConversas((anteriores) => podarConversas([...anteriores.filter((c) => c.id !== id), conversa]));
    void salvarConversa(conversa);
  }, [mensagens, carregando, pausado, disponivel, atualId]);

  /** Começa uma conversa nova (a atual já está guardada). */
  const nova = useCallback(() => {
    guardado.current = '';
    setAtualId(undefined);
  }, []);

  const abrir = useCallback(
    (id: string) => {
      const c = lista.current.find((x) => x.id === id);
      if (!c) return;
      guardado.current = `${c.id}|${c.mensagens.length}|${c.mensagens.at(-1)?.content}`;
      setAtualId(c.id);
      aoAbrir(c.mensagens);
    },
    [aoAbrir],
  );

  const alterar = useCallback((id: string, mudanca: Partial<ConversaSalva>) => {
    const c = lista.current.find((x) => x.id === id);
    if (!c) return;
    const nova = { ...c, ...mudanca };
    setConversas((anteriores) => podarConversas(anteriores.map((x) => (x.id === id ? nova : x))));
    void salvarConversa(nova);
  }, []);
  const renomear = useCallback(
    (id: string, titulo: string) => {
      const limpo = titulo.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (limpo) alterar(id, { titulo: limpo, tituloManual: true });
    },
    [alterar],
  );
  const fixar = useCallback(
    (id: string) => alterar(id, { fixada: !lista.current.find((c) => c.id === id)?.fixada }),
    [alterar],
  );

  const excluir = useCallback(
    (id: string) => {
      setConversas((anteriores) => anteriores.filter((c) => c.id !== id));
      void excluirConversa(id);
      if (id === atualId) {
        nova();
        aoLimpar();
      }
    },
    [atualId, nova, aoLimpar],
  );

  const apagarTudo = useCallback(() => {
    setConversas([]);
    void apagarTodasAsConversas();
    guardado.current = '';
    setAtualId(undefined);
    setAviso('Todas as conversas guardadas neste navegador foram apagadas.');
  }, []);

  const alternarPausa = useCallback(() => {
    setPausado((p) => {
      definirPausaDoHistorico(!p);
      setAviso(!p ? 'Histórico pausado: as próximas conversas não serão guardadas.' : 'Histórico ligado.');
      return !p;
    });
  }, []);

  const exportar = useCallback(() => {
    baixarArquivo(
      new Blob([serializarConversas(lista.current)], { type: 'application/json' }),
      `conversas-sindi-${new Date().toISOString().slice(0, 10)}.json`,
    );
  }, []);

  const importar = useCallback(async (arquivo: File | undefined) => {
    if (!arquivo) return;
    // Arquivo grande demais não é conversa nossa: recusa antes de ler.
    if (arquivo.size > 8_000_000) return setAviso('O arquivo é grande demais para ser um histórico da SINDI.');
    const quantas = await importarConversas(await arquivo.text());
    if (!quantas) return setAviso('Nenhuma conversa válida foi encontrada no arquivo.');
    setConversas(await listarConversas());
    setAviso(`${quantas} ${quantas === 1 ? 'conversa importada' : 'conversas importadas'}.`);
  }, []);

  return {
    conversas,
    atualId,
    pausado,
    disponivel,
    aviso,
    limparAviso: () => setAviso(''),
    nova,
    abrir,
    renomear,
    fixar,
    excluir,
    apagarTudo,
    alternarPausa,
    exportar,
    importar,
  };
}
