import type { Ferramenta } from '@/lib/ferramentas/tipos';

/**
 * Calculadora de tributos (CBS/IBS do regime regular, DAS do Simples Nacional e CBS/IBS no Simples). A conta roda no navegador com a lógica de
 * src/lib/tributos; não há rota de API própria. Não tem entrada no chat: as perguntas sobre tributos seguem as fontes do cérebro e levam à página.
 */
export const ferramentaTributos: Ferramenta = {
  id: 'tributos',
  pagina: 'tributos',
  // A conta roda no navegador; a rota só confere o cálculo com a calculadora oficial da Receita (serviço local opcional).
  api: ['/api/rtc/regime-geral', '/api/rtc/simples-nacional'],
  env: ['SINDI_RTC_REGIME_URL', 'SINDI_RTC_SIMPLES_URL'],
  testes: [
    'tests/lib/tributos/tributos.test.ts',
    'tests/lib/tributos/conformidade-rtc.test.ts',
    'tests/app/rtc-rotas.test.ts',
    'tests/app/rtc-simples-rotas.test.ts',
    'tests/lib/tributos/conformidade-rtc-simples.test.ts',
    'tests/lib/rtc/contrato-openapi.test.ts',
    'tests/componentes/interface-tributos.test.tsx',
  ],
};
