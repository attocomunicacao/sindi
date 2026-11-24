import { ROTULO_ESTIMATIVA } from '@/lib/tributos/regime-regular';
import type { ModoTributacao } from '@/lib/orcamento/tributacao-do-formulario';
import { AvisoLateral } from '@/componentes/ui/aviso';
import { CampoDecimal } from '@/componentes/ui/campo';
import { Seletor } from '@/componentes/ui/seletor';
import { SeletorDeAnexo, SeletorDeAno } from '@/componentes/tributos/seletores';
import { CATALOGO } from '@/componentes/orcamento/catalogo';
import { TituloDaSecao } from '@/componentes/orcamento/titulo-da-secao';
import type { useTributosDoOrcamento } from '@/componentes/orcamento/usar-tributos-do-orcamento';

type Tributos = ReturnType<typeof useTributosDoOrcamento>;

function CamposDaReforma({ tributos }: { tributos: Tributos }) {
  const { anoDaReforma, aliquotas, setAliquotas } = tributos;
  return <div className="space-y-3">
    <SeletorDeAno id="ano-reforma" rotulo="Ano da prestação" classeDoGrupo="max-w-xs" valor={anoDaReforma} aoMudar={tributos.escolherAnoDaReforma} />
    {anoDaReforma >= 2027
      ? <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-600">Alíquotas de {anoDaReforma} (pontos percentuais; editáveis)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <CampoDecimal id="a-cbs" rotulo="CBS (%)" value={aliquotas.cbs} aoMudar={v => setAliquotas({ ...aliquotas, cbs: v })} />
          <CampoDecimal id="a-uf" rotulo="IBS estadual (%)" value={aliquotas.ibsUf} aoMudar={v => setAliquotas({ ...aliquotas, ibsUf: v })} />
          <CampoDecimal id="a-mun" rotulo="IBS municipal (%)" value={aliquotas.ibsMun} aoMudar={v => setAliquotas({ ...aliquotas, ibsMun: v })} />
        </div>
        <p className="text-xs text-slate-600">Cálculo simulado: valores padrão são {ROTULO_ESTIMATIVA}.</p>
      </fieldset>
      : <p className="text-xs text-slate-600">2026 é ano de teste: CBS 0,90% e IBS 0,10% (banco oficial da Receita), destacados na nota sem custo.</p>}
  </div>;
}

function CamposDoSimples({ tributos }: { tributos: Tributos }) {
  const { simples, setSimples } = tributos;
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-4">
      <SeletorDeAnexo id="s-anexo" valor={simples.anexo} aoMudar={anexo => setSimples({ ...simples, anexo })} />
      <CampoDecimal id="s-rbt12" rotulo="RBT12 (R$)" value={simples.rbt12} aoMudar={v => setSimples({ ...simples, rbt12: v })} placeholder="ex.: 500000" />
      <CampoDecimal id="s-folha" rotulo="Folha 12 meses (R$)" value={simples.folha12} aoMudar={v => setSimples({ ...simples, folha12: v })} placeholder="opcional" />
      <SeletorDeAno id="s-ano" valor={simples.ano} aoMudar={ano => setSimples({ ...simples, ano })} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <CampoDecimal id="s-pcbs" rotulo="CBS efetiva do PGDAS-D (%)" value={simples.pCBS} aoMudar={v => setSimples({ ...simples, pCBS: v })} placeholder="opcional" />
      <CampoDecimal id="s-pibs" rotulo="IBS efetivo do PGDAS-D (%)" value={simples.pIBS} aoMudar={v => setSimples({ ...simples, pIBS: v })} placeholder="opcional" />
    </div>
    <p className="text-xs text-slate-600">A RBT12 e a folha são da empresa prestadora. No Anexo V, folha de 28% ou mais da RBT12 passa para o Anexo III (Fator R). A cessão de mão de obra só é permitida no Simples nas atividades do Anexo IV.</p>
  </div>;
}

type PropsDaSecaoTributacao = { tributos: Tributos; iss: number; aoMudarIss: (iss: number) => void };

/** Seção 04: regime de tributação do preço (regras atuais, Reforma Tributária ou Simples Nacional) e os campos de cada um. */
export function SecaoTributacao({ tributos, iss, aoMudarIss }: PropsDaSecaoTributacao) {
  const { modo, pendente } = tributos;
  return <section aria-labelledby="tributos" className="space-y-4">
    <TituloDaSecao id="tributos" numero="04">Tributos</TituloDaSecao>
    <div className="grid gap-3 sm:grid-cols-2">
      <Seletor id="modo-tributacao" rotulo="Tributação" value={modo} aoMudar={v => tributos.setModo(v as ModoTributacao)}>
        <option value="atual">Regras atuais (ISS, PIS, COFINS)</option><option value="reforma">Reforma Tributária (CBS/IBS)</option><option value="simples">Simples Nacional (DAS)</option>
      </Seletor>
      {modo !== 'simples' && <Seletor id="iss" rotulo="ISS do município da prestação" value={iss ?? ''} aoMudar={v => aoMudarIss(Number(v))}>
        {CATALOGO.iss.map(v => <option key={v} value={v}>{(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</option>)}
      </Seletor>}
    </div>
    {modo === 'atual' && <p className="text-xs text-slate-500">PIS, COFINS, contribuição social, IRPJ, BDI e lucro seguem a tabela de referência.</p>}
    {modo === 'reforma' && <CamposDaReforma tributos={tributos} />}
    {modo === 'simples' && <CamposDoSimples tributos={tributos} />}
    {pendente && <AvisoLateral role="status" tamanho="pequeno">{pendente} Enquanto isso, o resultado usa as regras atuais.</AvisoLateral>}
  </section>;
}
