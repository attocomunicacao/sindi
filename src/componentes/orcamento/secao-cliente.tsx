import { CampoDeTexto } from '@/componentes/ui/campo';
import { Opcional, TituloDaSecao } from '@/componentes/orcamento/titulo-da-secao';

type Cliente = { empresa: string; contato: string; local: string };
type PropsDaSecaoCliente = {
  cliente: Cliente;
  aoMudarCliente: (campo: keyof Cliente, valor: string) => void;
  metros: string;
  aoMudarMetros: (valor: string) => void;
};

/** Seção 01: dados de quem pede o orçamento, que só vão para o PDF. */
export function SecaoCliente({ cliente, aoMudarCliente, metros, aoMudarMetros }: PropsDaSecaoCliente) {
  return (
    <section aria-labelledby="dados-cliente" className="space-y-4">
      <TituloDaSecao id="dados-cliente" numero="01">
        Seus dados <Opcional>(opcionais, aparecem no PDF)</Opcional>
      </TituloDaSecao>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoDeTexto
          id="empresa"
          rotulo="Empresa"
          maxLength={120}
          value={cliente.empresa}
          aoMudar={(v) => aoMudarCliente('empresa', v)}
        />
        <CampoDeTexto
          id="contato"
          rotulo="Contato"
          maxLength={120}
          value={cliente.contato}
          aoMudar={(v) => aoMudarCliente('contato', v)}
        />
        <CampoDeTexto
          id="local"
          rotulo="Local da prestação"
          maxLength={160}
          value={cliente.local}
          aoMudar={(v) => aoMudarCliente('local', v)}
        />
        <CampoDeTexto
          id="metros"
          rotulo="Área atendida (m²)"
          inputMode="decimal"
          value={metros}
          aoMudar={aoMudarMetros}
          placeholder="ex.: 1200"
        />
      </div>
      <p className="text-xs text-slate-500">
        Estes dados só são usados para montar o PDF. Nada é gravado nem enviado a terceiros.
      </p>
    </section>
  );
}
