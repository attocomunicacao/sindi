# Pendências da refatoração para decisão humana

## Fechamento da refatoração estrutural (branch `refatora/estrutura`, 2026-11-24)
Ponto de retorno: commit `2d5d696`. Comportamento mantido; o que foi provado e o que não foi:

- **Provado:** lint, typecheck, build, 304 testes (1 `todo` conhecido de SSRF por DNS), cobertura de linhas 91% (mínimo 80%), sem ciclos entre arquivos (`madge`), `npm audit --audit-level=high` sem altas, `verificar:funcional` 28/28 e `-- --chat` 29/29, Prettier limpo. PDFs (orçamento, custos, painel, DANFSe) e o grafo do cérebro saem byte a byte iguais. A recuperação lexical é idêntica nas 319 perguntas de `cerebro/avaliacao/` (só o carimbo `fetchedAt` e os campos removidos `context`/`sufficient` diferem). Guardião de segurança: 0 achados; `.claude/settings.json`, hooks e `.mcp.json` idênticos ao original.
- **NÃO provado — rode quando a cota do Gemini renovar:** `npm run avaliar:treino` (leia as respostas) e `npm run cerebro:comparar`. A rodada feita bateu no limite gratuito (429) em 49 de 91 perguntas; as 41 respondidas foram lidas sem fato trocado. A parte semântica (embeddings) da recuperação não foi comparada. Não existe linha de base do `avaliar:treino` anterior à refatoração.
- **e2e: 5 falhas que já existiam antes da refatoração** (conferidas num worktree do estado anterior): `/tributos` com violação axe `listitem` (4 casos: `<ul role="note">` em `MemoriaDeCalculo` deixa os `<li>` fora de uma lista) e o teste "Tab chega à caixa do chat" (o botão Configuração consome um Tab e o teste tenta 14). O teste de rolagem do chat (`chat.spec.ts`) é instável sob carga. Corrigir fica fora da refatoração.
- **Deixado de propósito (sensível ou de risco médio):** reorganizar `segredoConfere` (`ehAquecimento` e `repasseConfiavel` têm o mesmo `timingSafeEqual`), `recusa()` em `infra/cota.ts`, mover `http/ip.ts` para `infra/`, regex gigantes de `chat/escopo.ts` (1.343 colunas; montar por lista comentada), cache por mtime em 5 cópias (`cerebro/*`, `grafo/consulta`), `process.loadEnvFile('.env.knowledge')` no topo de `recuperacao/recuperar.ts`, `respostaDireta`/campo `direta` (usados por `cerebro/conhecimento/faq.md` e `diretoria.md`), aberturas de SQLite fora de `try` (migrar para `comBancoSomenteLeitura` mudaria o comportamento ao falhar), `gerarTextoGemini` agora só no teste, callbacks `onDelta`/`onReset`, `chat/stream.ts` e `scripts/knowledge-sync.ts` ainda com nomes em inglês, e a função `gerar` da rota do chat (53 linhas, orquestra cota e guarda).
- **Observação de segurança (já documentada):** sem `SINDI_IP_HEADER`, `ipDoPedido` aceita `cf-connecting-ip`, `x-vercel-forwarded-for` e `x-real-ip` sem assinatura; fora do túnel/repasse a cota por IP pode ser forjada (só o teto global limita). Mantenha `SINDI_IP_HEADER` definido em produção.
- **Para você revisar antes de mesclar:** a branch tem 13 commits pequenos e reversíveis desde `2d5d696` (`git log --oneline 2d5d696..HEAD`). Nada foi enviado a nenhum remoto. A tarefa agendada do Windows não precisou ser recriada (nenhum script que ela usa foi renomeado).

# Pendências da Fase 6 para decisão humana

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
- Campos de opções em `src/lib/dados/sync.ts` (`only`, `full`, `collectors`, `timeoutMs`, `concurrency`; tipo `OpcoesDeSincronizacao`) e os de `OpcoesDeBusca` em `dados/http.ts` (`minMs`, `respectRobots`), além dos campos de tipos que viram JSON ou colunas SQLite.
