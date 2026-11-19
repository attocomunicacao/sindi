import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Testes de ponta a ponta: um servidor de produção (`next start`, com CSP e nonce como no ar) sobre um banco vazio e sem chave real. O chat de IA é simulado
// no navegador (e2e/ajuda.ts), então nenhum teste gasta o limite gratuito do Gemini nem depende de rede. Requer `npm run build` antes (o `npm run test:e2e` faz isso).
const porta = Number(process.env.E2E_PORTA ?? 3300);
const base = `http://127.0.0.1:${porta}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: base, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx next start -H 127.0.0.1 -p ${porta}`,
    url: base,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      SINDI_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'sindi-e2e-')), SINDI_COTA_IP_DIA: '0', SINDI_COTA_GLOBAL_DIA: '0', SINDI_CACHE_RESPOSTAS: '0',
      GEMINI_API_KEY: 'chave-e2e-sem-valor', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', SINDI_PUBLIC_ORIGIN: '',
    },
  },
});
