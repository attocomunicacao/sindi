// Cria (ou atualiza) no Ollama os dois modelos da SINDI, com os parâmetros desta máquina e as regras de cerebro/instrucoes/identidade-e-regras.md:
//   sindi         ← qwen2.5:3b    escreve as respostas com fatos (o menor que, medido, não troca nem inventa o que está nas fontes)
//   sindi-rapido  ← qwen2.5:1.5b  saudação, recusas e encaminhamentos (2x mais rápido, metade da memória)
// Uso: npm run modelo:criar [-- --base=qwen2.5:3b] [-- --rapido=qwen2.5:1.5b]
// Não treina pesos: o "ensino" está nos arquivos de cerebro/ (regras, exemplos, conectores e conhecimento), que o chat envia a cada pergunta.
// Os arquivos gerados em modelo/ servem também para testar direto no terminal: `ollama run sindi`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sistema } from '../../src/lib/cerebro/instrucoes';
import { geracao } from '../../src/lib/ollama';

const argumento = (nome: string) => process.argv.find(a => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const modelos = [
  { nome: 'sindi', base: argumento('base') ?? process.env.SINDI_MODELO_BASE ?? 'qwen2.5:3b' },
  { nome: 'sindi-rapido', base: argumento('rapido') ?? process.env.SINDI_MODELO_BASE_RAPIDO ?? 'qwen2.5:1.5b' },
];
const g = geracao(); const pasta = path.resolve('modelo'); mkdirSync(pasta, { recursive: true });
let falhas = 0;
for (const { nome, base } of modelos) {
  // As threads ficam fora do Modelfile: o chat as define por pedido (SINDI_NUM_THREAD), conforme o computador em que roda.
  const modelfile = `# Gerado por scripts/modelo/criar-modelo.ts — não edite à mão. Edite cerebro/instrucoes/identidade-e-regras.md e rode: npm run modelo:criar
FROM ${base}
PARAMETER temperature ${g.temperature}
PARAMETER top_p ${g.top_p}
PARAMETER repeat_penalty ${g.repeat_penalty}
PARAMETER num_ctx ${g.num_ctx}
SYSTEM """${sistema().replace(/"""/g, '"')}"""
`;
  const arquivo = path.join(pasta, `Modelfile.${nome}`); writeFileSync(arquivo, modelfile, 'utf8');
  try {
    execFileSync('ollama', ['create', nome, '-f', arquivo], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`Modelo "${nome}" pronto (base ${base}, contexto de ${g.num_ctx} tokens) — ${path.relative(process.cwd(), arquivo)}`);
  } catch { falhas++; console.error(`Não foi possível criar "${nome}". Confira se o Ollama está aberto e se a base está instalada: ollama pull ${base}`); }
}
process.exit(falhas ? 1 : 0);
