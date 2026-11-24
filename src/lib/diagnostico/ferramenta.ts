import type { Ferramenta } from '@/lib/ferramentas/tipos';

/**
 * Diagnóstico de Exposição: página sem rota de API e sem entrada no chat de propósito. As respostas da empresa só existem no navegador;
 * se o chat executasse a ferramenta, a pergunta (e o que ela contém) passaria pelo servidor.
 */
export const ferramentaDiagnostico: Ferramenta = {
  id: 'diagnostico',
  pagina: 'diagnostico',
  testes: ['tests/lib/diagnostico/diagnostico.test.ts', 'tests/componentes/interface-diagnostico.test.tsx'],
};
