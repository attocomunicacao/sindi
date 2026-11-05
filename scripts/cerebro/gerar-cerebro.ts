// Gera os arquivos autogerados do cérebro da SINDI (cerebro/auto/*.md) a partir dos dados coletados, sem validação nem reversão.
// Uso: npm run cerebro:gerar   (a coleta contínua já faz isso sozinha, com validação; veja src/lib/cerebro/publicar.ts)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../../src/lib/dados/db';
import { gerarArquivos } from '../../src/lib/cerebro/gerar';
import { pastaCerebro } from '../../src/lib/cerebro/carregar';

const saida = path.join(pastaCerebro(), 'auto'); mkdirSync(saida, { recursive: true });
for (const [arquivo, texto] of Object.entries(gerarArquivos(openDb()))) { writeFileSync(path.join(saida, arquivo), texto, 'utf8'); console.log('gerado', arquivo, texto.length, 'caracteres'); }
