// Hook PreToolUse: impede que agentes leiam, imprimam, copiem ou editem os arquivos .env*.local (segredos reais do projeto; regra do AGENTS.md).
// Recebe o pedido da ferramenta em JSON pela entrada padrão; sair com código 2 bloqueia a ação e devolve a mensagem ao agente.
// É defesa em profundidade: o `deny` de .claude/settings.json continua valendo.
//
// - Ferramentas de arquivo (Read, Edit, Write, Grep, Glob): bloqueia caminho/padrão que aponte para um .env*.local (inclusive por curinga).
// - Comandos (Bash, PowerShell): bloqueia QUALQUER comando que cite o arquivo (por nome, curinga ou nome montado por concatenação), exceto a forma
//   fechada usada pelos scripts do projeto: `[timeout N] npx tsx --env-file=.env.local scripts/....ts [args] [2>&1] [| tail/head -N]`, que carrega as
//   variáveis no processo do script sem imprimi-las. `node --env-file=.env.local -e ...` (que imprimiria tudo) é bloqueado.
const citaArquivo = /\.env[\w.-]*\.l(?:o(?:c(?:a(?:l)?)?)?)?(?:\*|\?|\b)|\.env[\w.-]*[*?]|\.env['"`]\s*[+.]|['"`]\.local['"`]/i;
const caminhoPrivado = /(^|[\\/\s"'=*])\.env(\.[\w*?-]+)*\.(local|loc\*|l\*)\b|\.env[*?]/i;
const PERMITIDO = /^\s*(timeout \d+ )?npx tsx --env-file=\.env\.local scripts\/[\w/.-]+\.ts( [\w=:,./-]+)*( 2>&1)?( \| (tail|head) -\d+)?\s*$/;

let entrada = '';
process.stdin.on('data', parte => { entrada += parte; });
process.stdin.on('end', () => {
  let pedido = {};
  try { pedido = JSON.parse(entrada || '{}'); } catch { process.exit(0); }
  const dados = pedido.tool_input ?? {};
  const caminhos = [dados.file_path, dados.path, dados.pattern, dados.glob].filter(v => typeof v === 'string');
  const comando = typeof dados.command === 'string' ? dados.command : '';
  const comandoProibido = comando && citaArquivo.test(comando) && !PERMITIDO.test(comando);
  if (caminhos.some(c => caminhoPrivado.test(c)) || comandoProibido) {
    process.stderr.write('Bloqueado: arquivos .env*.local guardam segredos reais e não podem ser lidos, impressos, copiados ou editados por agentes (AGENTS.md). Para rodar um script com as variáveis use exatamente: npx tsx --env-file=.env.local scripts/<arquivo>.ts');
    process.exit(2);
  }
  process.exit(0);
});
