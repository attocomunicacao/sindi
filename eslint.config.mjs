import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals, ...nextTs, { rules: { eqeqeq: ['error', 'always', { null: 'ignore' }] } }, globalIgnores(['.next/**', '.data/**', '.tools/**', 'next-env.d.ts'])]);

