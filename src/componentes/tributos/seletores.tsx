import type { Anexo } from '@/lib/tributos/das';
import { ANOS } from '@/lib/tributos/regime-regular';
import { Seletor } from '@/componentes/ui/seletor';

type PropsDoSeletorDeAno = {
  id: string;
  valor: number;
  aoMudar: (ano: number) => void;
  rotulo?: string;
  classeDoGrupo?: string;
};

/** Anos em que a Reforma Tributária e o Simples têm regra (de 2026 a 2033). */
export function SeletorDeAno({ id, valor, aoMudar, rotulo = 'Ano', classeDoGrupo }: PropsDoSeletorDeAno) {
  return (
    <Seletor id={id} rotulo={rotulo} classeDoGrupo={classeDoGrupo} value={valor} aoMudar={(v) => aoMudar(Number(v))}>
      {ANOS.map((ano) => (
        <option key={ano} value={ano}>
          {ano}
        </option>
      ))}
    </Seletor>
  );
}

type PropsDoSeletorDeAnexo = { id: string; valor: Anexo; aoMudar: (anexo: Anexo) => void; indicarFatorR?: boolean };

/** Anexo do Simples Nacional; com `indicarFatorR`, o Anexo V traz a dica "(Fator R)". */
export function SeletorDeAnexo({ id, valor, aoMudar, indicarFatorR = true }: PropsDoSeletorDeAnexo) {
  return (
    <Seletor id={id} rotulo="Anexo" value={valor} aoMudar={(v) => aoMudar(v as Anexo)}>
      <option value="III">III</option>
      <option value="IV">IV (vigilância, limpeza)</option>
      <option value="V">{indicarFatorR ? 'V (Fator R)' : 'V'}</option>
    </Seletor>
  );
}
