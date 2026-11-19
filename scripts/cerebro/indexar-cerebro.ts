// Calcula os vetores (embeddings) dos trechos do cérebro. Uso: npm run cerebro:indexar (requer GEMINI_API_KEY no ambiente; usa o nível gratuito do Gemini, então pode demorar se o limite por minuto for atingido).
import { indexarCerebro } from '../../src/lib/cerebro/embeddings';
const r = await indexarCerebro(undefined, console.log);
console.log(`Índice pronto: ${r.total} trechos (${r.novos} novos ou alterados).`);
