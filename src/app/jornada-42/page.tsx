import { PaginaFerramenta } from '@/componentes/ui/pagina-ferramenta';
import { KitJornada42 } from '@/componentes/jornada42/kit-jornada-42';

export const metadata = { title: 'Kit Jornada 42 | SINDI' };

export default function Jornada42Page() {
  return (
    <PaginaFerramenta
      largura="max-w-6xl"
      espaco="space-y-10"
      titulo="Kit Jornada 42"
      descricao="Roteiro por perfil de empresa, impacto no custo do posto e modelos de comunicado para a Emenda Constitucional 141/2026."
    >
      {/* Variável pública (sem segredo), lida no servidor só para o bloco da aula aparecer quando houver link. */}
      <KitJornada42 aulaUrl={process.env.NEXT_PUBLIC_JORNADA42_AULA_URL ?? ''} />
    </PaginaFerramenta>
  );
}
