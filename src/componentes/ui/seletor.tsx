import type { ComponentProps } from 'react';
import { CLASSE_ROTULO, classeDoCampo } from '@/componentes/ui/campo';

type PropsDoSeletor = Omit<ComponentProps<'select'>, 'id' | 'onChange'> & { id: string; rotulo: string; classeDoGrupo?: string; aoMudar: (valor: string) => void };

/** <select> com rótulo ligado por `id`; as opções vão como filhos e `aoMudar` recebe o valor escolhido. */
export function Seletor({ id, rotulo, classeDoGrupo, aoMudar, className, children, ...resto }: PropsDoSeletor) {
  return <div className={classeDoGrupo}>
    <label htmlFor={id} className={CLASSE_ROTULO}>{rotulo}</label>
    <select id={id} className={classeDoCampo(className)} onChange={e => aoMudar(e.target.value)} {...resto}>{children}</select>
  </div>;
}
