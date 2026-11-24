import { Search } from 'lucide-react';

type PropsDoFormulario = {
  acao: string;
  valor?: string;
  escondidos?: Record<string, string | undefined>;
  placeholder: string;
  rotulo?: string;
  tamanho?: 'grande' | 'compacto';
};

/** Busca por texto (GET, funciona sem JavaScript); `escondidos` leva junto os filtros já escolhidos. */
export function FormularioDeBusca({
  acao,
  valor,
  escondidos = {},
  placeholder,
  rotulo = 'Buscar na biblioteca',
  tamanho = 'grande',
}: PropsDoFormulario) {
  const grande = tamanho === 'grande';
  const altura = grande ? 'h-12 text-base' : 'h-10 text-sm';
  return (
    <form action={acao} method="get" role="search" className={`flex w-full gap-2 ${grande ? 'max-w-2xl' : 'max-w-md'}`}>
      {Object.entries(escondidos).map(([nome, v]) =>
        v ? <input key={nome} type="hidden" name={nome} value={v} /> : null,
      )}
      <label className="relative flex-1">
        <span className="sr-only">{rotulo}</span>
        <Search
          size={grande ? 18 : 16}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          name="q"
          defaultValue={valor}
          maxLength={120}
          autoComplete="off"
          placeholder={placeholder}
          className={`w-full rounded-lg border border-slate-300 bg-surface pl-10 pr-3 text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-amber-400 ${altura}`}
        />
      </label>
      <button
        type="submit"
        className={`rounded-lg bg-primary px-5 font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${altura}`}
      >
        Buscar
      </button>
    </form>
  );
}
