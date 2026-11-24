# Pendências da refatoração (Fase 6) para decisão humana

Nada abaixo foi apagado nem renomeado: a execução foi conservadora, sem confirmação do usuário.

## Feito na Fase 6
- Apagados (sem nenhuma referência no repositório): `scripts/avaliacao/eval-chat.mjs`, `scripts/operacao/inspect-site.mjs`, `cerebro/avaliacao/_proposta.md` (as perguntas de comercial já constam de `treino-v1.md`; o arquivo segue no histórico do git).
- Movidos para `docs/historico/` (com aviso no topo): `16-resumo-e-guia-do-desenvolvedor.md`, `21-fluxo-e-modelo-reduzido.md`, `08-implementation.md`. `docs/imagens/voice-preview.png` (única imagem sem referência) foi para `docs/historico/imagens/`.
- Lista de comandos: fonte única em `CLAUDE.md` (seção Comandos); `README.md` e `AGENTS.md` apontam para ela.

## Decisões pendentes
1. **Espelho antigo do site** (`scripts/knowledge-sync.ts`, `start-knowledge.ps1/.vbs`, `configure-knowledge.ps1`, `src/lib/recuperacao/legado/*`, scripts npm `knowledge:sync`/`knowledge:watch`, coletor `sindeprestem` que lê `.data/knowledge/current.json`): só podem sair se o usuário confirmar que a tarefa agendada `SINDI-Knowledge` e o espelho estão desativados.
2. **`scripts/operacao/create-share-banner.mjs`**: mantido por instrução; é citado em `docs/operacao/13-endereco-fixo-vercel.md`. Decidir se ainda é usado.
3. **Docs `operacao/09-publicacao-local.md`, `operacao/10-apresentacao-temporaria.md`, `ia/11-base-de-conhecimento.md` e `seguranca/verification.md`**: parecem em parte superados (o 23 e o guia vigente os substituem na prática; o 11 descreve o Supabase/espelho legado). Não foram movidos. `verification.md` ainda referencia 8 imagens de `docs/imagens/` e descreve o painel `/uso` antigo; se for arquivado, as imagens vão junto.
4. **`docs/avaliacao/2026-11-avaliacao.md`** é um retrato datado e cita caminhos antigos (`src/lib/knowledge`, `src/lib/gemini.ts`, `src/lib/chat.ts`, `dados/collectors`). Mantido como está; `docs/ia/17-20` seguem como histórico técnico de 13/10/2026 (só caminhos de `src/components` do 20 e `collectors` do 22 foram corrigidos).
5. **`cerebro/avaliacao/`**: `parafrases*.md` e `perguntas-ouro*.md` são lidos por `cerebro:comparar` e `cerebro:avaliar` (padrão ou `--arquivo=`); mantidos. `adversariais.md` ainda diz que exige o Ollama ligado (conteúdo de `cerebro/`, não alterado).

## Nomes em inglês que restam (não renomeados: tarefa agendada, .ps1/.vbs, package.json)
- `scripts/knowledge-sync.ts`, `scripts/start-knowledge.ps1`, `scripts/start-knowledge.vbs`, `scripts/configure-knowledge.ps1`, `scripts/operacao/create-share-banner.mjs`.
- Scripts npm `knowledge:sync` e `knowledge:watch`.
- `src/lib/recuperacao/legado/{extract,status,supabase}.ts`; arquivos em disco `.data/usage.json` e `.data/knowledge/` (renomear exige migração).
- Identificadores internos em `src/lib/dados/sync.ts` (`SyncOptions`, `collectors`, `timeoutMs`, `concurrency`, `syncAll`) e correlatos.
