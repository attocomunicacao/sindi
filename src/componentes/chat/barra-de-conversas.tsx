'use client';
import { useRef, useState } from 'react';
import { Download, Pause, Pencil, Pin, PinOff, Play, Plus, Trash2, Upload } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { CLASSE_CAMPO } from '@/componentes/ui/campo';
import { agruparPorData, filtrarConversas, type ConversaSalva } from '@/componentes/chat/historico-local';
import type { useHistorico } from '@/componentes/chat/usar-historico';

type Historico = ReturnType<typeof useHistorico>;
type Props = {
  historico: Historico;
  /** Há uma resposta em andamento: abrir outra conversa agora a cortaria. */
  ocupado: boolean;
  /** "Nova conversa" (esvazia o chat). */
  aoNova: () => void;
  /** Depois de escolher uma conversa ou começar uma nova (a gaveta do celular se fecha). */
  aoEscolher?: () => void;
  /** Distingue os ids de campo quando a barra existe duas vezes na página (coluna do desktop e gaveta). */
  prefixo?: string;
};

const CLASSE_DO_ICONE =
  'inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-40 pointer-coarse:size-10';

function ItemDaConversa({
  conversa,
  atual,
  ocupado,
  historico,
  aoEscolher,
  prefixo,
}: {
  conversa: ConversaSalva;
  atual: boolean;
  ocupado: boolean;
  historico: Historico;
  aoEscolher?: () => void;
  prefixo: string;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [titulo, setTitulo] = useState(conversa.titulo);
  if (editando)
    return (
      <li className="px-1">
        <label htmlFor={`${prefixo}titulo-${conversa.id}`} className="sr-only">
          Novo título da conversa
        </label>
        <input
          id={`${prefixo}titulo-${conversa.id}`}
          autoFocus
          value={titulo}
          maxLength={60}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={() => {
            historico.renomear(conversa.id, titulo);
            setEditando(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setTitulo(conversa.titulo);
              setEditando(false);
            }
          }}
          className={CLASSE_CAMPO}
        />
      </li>
    );
  if (confirmando)
    return (
      <li className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
        <p>Excluir esta conversa?</p>
        <div className="mt-2 flex gap-2">
          <Botao
            type="button"
            variante="contorno"
            className="min-h-8 px-3 text-xs"
            onClick={() => historico.excluir(conversa.id)}
          >
            Excluir
          </Botao>
          <Botao
            type="button"
            variante="discreto"
            className="min-h-8 px-3 text-xs"
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </Botao>
        </div>
      </li>
    );
  return (
    <li className="group relative">
      <button
        type="button"
        disabled={ocupado}
        aria-current={atual ? 'true' : undefined}
        onClick={() => {
          historico.abrir(conversa.id);
          aoEscolher?.();
        }}
        className={`block w-full truncate rounded-lg py-2 pl-3 pr-24 text-left text-sm focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50 ${atual ? 'bg-slate-200/70 font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-100'}`}
      >
        {conversa.fixada && <Pin size={12} className="mr-1.5 inline text-amber-600" aria-hidden />}
        {conversa.titulo}
      </button>
      <span className="absolute inset-y-0 right-1 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
        <button
          type="button"
          className={CLASSE_DO_ICONE}
          aria-label={conversa.fixada ? 'Desafixar conversa' : 'Fixar conversa'}
          onClick={() => historico.fixar(conversa.id)}
        >
          {conversa.fixada ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          type="button"
          className={CLASSE_DO_ICONE}
          aria-label="Renomear conversa"
          onClick={() => setEditando(true)}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className={CLASSE_DO_ICONE}
          aria-label="Excluir conversa"
          onClick={() => setConfirmando(true)}
        >
          <Trash2 size={14} />
        </button>
      </span>
    </li>
  );
}

/** O conteúdo da barra de conversas (na coluna do desktop e na gaveta do celular): nova conversa, busca, lista por data e os controles de privacidade. */
export function BarraDeConversas({ historico, ocupado, aoNova, aoEscolher, prefixo = '' }: Props) {
  const [busca, setBusca] = useState('');
  const [apagando, setApagando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const grupos = agruparPorData(filtrarConversas(historico.conversas, busca));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Botao
        type="button"
        variante="contorno"
        className="w-full justify-start"
        disabled={ocupado}
        onClick={() => {
          aoNova();
          aoEscolher?.();
        }}
      >
        <Plus size={16} aria-hidden />
        Novo chat
      </Botao>
      {historico.conversas.length > 0 && (
        <div>
          <label htmlFor={`${prefixo}busca-conversas`} className="sr-only">
            Buscar nas conversas
          </label>
          <input
            id={`${prefixo}busca-conversas`}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nas conversas"
            className={CLASSE_CAMPO}
          />
        </div>
      )}
      <nav aria-label="Conversas guardadas" className="min-h-0 flex-1 overflow-y-auto">
        {grupos.map((g) => (
          <section key={g.rotulo} className="mb-4">
            <h3 className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{g.rotulo}</h3>
            <ul className="space-y-0.5">
              {g.conversas.map((c) => (
                <ItemDaConversa
                  key={c.id}
                  conversa={c}
                  atual={c.id === historico.atualId}
                  ocupado={ocupado}
                  historico={historico}
                  aoEscolher={aoEscolher}
                  prefixo={prefixo}
                />
              ))}
            </ul>
          </section>
        ))}
        {!grupos.length && (
          <p className="px-3 text-sm text-slate-500">
            {historico.conversas.length
              ? 'Nenhuma conversa encontrada.'
              : 'As conversas que você tiver com a SINDI aparecem aqui.'}
          </p>
        )}
      </nav>
      <div className="space-y-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
        <p>
          {historico.disponivel
            ? 'As conversas ficam só neste navegador: a SINDI não as guarda em servidor.'
            : 'Este navegador não permite guardar conversas (janela privada ou armazenamento bloqueado).'}
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={CLASSE_DO_ICONE}
            aria-pressed={historico.pausado}
            aria-label={historico.pausado ? 'Retomar histórico' : 'Pausar histórico'}
            title={historico.pausado ? 'Retomar histórico' : 'Pausar histórico'}
            onClick={historico.alternarPausa}
          >
            {historico.pausado ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button
            type="button"
            className={CLASSE_DO_ICONE}
            aria-label="Exportar conversas"
            title="Exportar conversas (arquivo JSON)"
            disabled={!historico.conversas.length}
            onClick={historico.exportar}
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            className={CLASSE_DO_ICONE}
            aria-label="Importar conversas"
            title="Importar conversas (arquivo JSON)"
            onClick={() => arquivo.current?.click()}
          >
            <Upload size={15} />
          </button>
          <input
            ref={arquivo}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Arquivo de conversas para importar"
            onChange={(e) => {
              void historico.importar(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className={CLASSE_DO_ICONE}
            aria-label="Apagar todas as conversas"
            title="Apagar todas as conversas"
            disabled={!historico.conversas.length}
            onClick={() => setApagando(true)}
          >
            <Trash2 size={15} />
          </button>
        </div>
        {apagando && (
          <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-800">
            <p>Apagar todas as conversas deste navegador? Não dá para desfazer.</p>
            <div className="mt-2 flex gap-2">
              <Botao
                type="button"
                variante="contorno"
                className="min-h-8 px-3 text-xs"
                onClick={() => {
                  historico.apagarTudo();
                  setApagando(false);
                }}
              >
                Apagar tudo
              </Botao>
              <Botao
                type="button"
                variante="discreto"
                className="min-h-8 px-3 text-xs"
                onClick={() => setApagando(false)}
              >
                Cancelar
              </Botao>
            </div>
          </div>
        )}
        <p aria-live="polite" className="min-h-4">
          {historico.aviso}
        </p>
      </div>
    </div>
  );
}
