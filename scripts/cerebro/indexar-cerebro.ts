// Calcula os vetores (embeddings) dos trechos do cérebro. Uso: npm run cerebro:indexar (requer `ollama pull nomic-embed-text`).
import { indexarCerebro } from '../../src/lib/cerebro/embeddings';
const r = await indexarCerebro(undefined, console.log);
console.log(`Índice pronto: ${r.total} trechos (${r.novos} novos ou alterados).`);
