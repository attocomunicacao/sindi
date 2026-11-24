// Uso: npm run grafo:gerar   (também roda no fim de cada coleta, em scripts/dados/dados-sync.ts)
// Monta o grafo do cérebro (conectores, estantes, conhecimento, documentos da biblioteca e as leis/NRs/projetos que os ligam), grava
// .data/dados/grafo.json (lido pela página /cerebro e pela busca do chat) e o cofre do Obsidian em .data/obsidian/SINDI.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from '@/lib/dados/db';
import { construirGrafo } from '@/lib/grafo/construir';
import { exportarObsidian } from '@/lib/grafo/obsidian';
import { arquivoDoGrafo } from '@/lib/grafo/consulta';

const inicio = Date.now();
const grafo = construirGrafo();
mkdirSync(dataDir(), { recursive: true });
const destino = arquivoDoGrafo();
writeFileSync(`${destino}.tmp`, JSON.stringify(grafo)); renameSync(`${destino}.tmp`, destino);
const cofre = path.resolve('.data/obsidian/SINDI');
const { notas } = exportarObsidian(grafo, cofre, process.env.SINDI_PUBLIC_ORIGIN || 'http://localhost:3000');
console.log(`Grafo: ${grafo.nos.length} nós e ${grafo.arestas.length} ligações em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
console.log(Object.entries(grafo.resumo).filter(([, n]) => n).map(([t, n]) => `${t}: ${n}`).join(' · '));
console.log(`Arquivo: ${destino}\nCofre do Obsidian (${notas} notas): ${cofre}`);
