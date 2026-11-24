import type { ComponentProps, ReactNode } from 'react';

/** Estilo único dos campos de formulário (entrada de texto, número e seleção). */
export const CLASSE_CAMPO =
  'w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 focus-visible:border-amber-400 focus-visible:outline-none';
export const CLASSE_ROTULO = 'mb-1 block text-xs font-medium text-slate-600';
/** Caixa de marcação com o dourado do tema. */
export const CLASSE_CAIXA_DE_MARCACAO = 'size-4 accent-amber-500';

/** Junta o estilo padrão com classes extras sem resolver conflitos (como "w-full" e "w-40"): o resultado visual é o da ordem do CSS gerado, como nos formulários originais. */
export const classeDoCampo = (extra?: string) => (extra ? `${CLASSE_CAMPO} ${extra}` : CLASSE_CAMPO);

/** Rótulo ligado ao campo por `id`, dentro de um bloco que a grade da tela posiciona. */
export function GrupoDoCampo({
  id,
  rotulo,
  classeDoGrupo,
  children,
}: {
  id: string;
  rotulo: string;
  classeDoGrupo?: string;
  children: ReactNode;
}) {
  return (
    <div className={classeDoGrupo}>
      <label htmlFor={id} className={CLASSE_ROTULO}>
        {rotulo}
      </label>
      {children}
    </div>
  );
}

type PropsDeEntrada = Omit<ComponentProps<'input'>, 'id' | 'onChange'> & {
  id: string;
  rotulo: string;
  classeDoGrupo?: string;
  aoMudar?: (valor: string) => void;
};

/** Entrada de texto com rótulo; `aoMudar` recebe o texto digitado. */
export function CampoDeTexto({ id, rotulo, classeDoGrupo, aoMudar, className, ...resto }: PropsDeEntrada) {
  return (
    <GrupoDoCampo id={id} rotulo={rotulo} classeDoGrupo={classeDoGrupo}>
      <input
        id={id}
        className={classeDoCampo(className)}
        onChange={aoMudar && ((e) => aoMudar(e.target.value))}
        {...resto}
      />
    </GrupoDoCampo>
  );
}

/** Entrada de texto livre para número pt-BR ("1.234,50"): teclado numérico no celular, sem travar a vírgula. */
export function CampoDecimal(props: PropsDeEntrada) {
  return <CampoDeTexto inputMode="decimal" {...props} />;
}

type PropsDeNumero = {
  id: string;
  rotulo: string;
  valor: number;
  aoMudar: (n: number) => void;
  passo?: number;
  min?: number;
  max?: number;
};

/** Campo <input type="number"> que entrega o valor já convertido. */
export function CampoNumerico({ id, rotulo, valor, aoMudar, passo = 1, min = 0, max }: PropsDeNumero) {
  return (
    <CampoDeTexto
      id={id}
      rotulo={rotulo}
      type="number"
      inputMode="decimal"
      className="tabular-nums"
      value={valor}
      step={passo}
      min={min}
      max={max}
      aoMudar={(texto) => aoMudar(Number(texto))}
    />
  );
}
