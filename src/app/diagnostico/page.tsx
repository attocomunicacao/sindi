import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { DiagnosticoDeExposicao } from '@/componentes/diagnostico/diagnostico-de-exposicao';

export const metadata = { title: 'Diagnóstico de Exposição | SINDI' };

export default function DiagnosticoPage() {
  return (
    <PaginaFerramenta
      largura="max-w-4xl"
      espaco="space-y-10"
      titulo="Diagnóstico de Exposição"
      descricao="Quinze perguntas sobre jornada, contratos e segurança do trabalho, com semáforo por tema e plano de ação, cada ponto ligado à fonte oficial. As respostas ficam só neste aparelho."
    >
      <DiagnosticoDeExposicao />
    </PaginaFerramenta>
  );
}
