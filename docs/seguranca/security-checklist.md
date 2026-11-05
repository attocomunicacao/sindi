# Checklist da apresentação e base documental

- [x] Escopo aprovado e design detalhado dispensado.
- [x] Segredos fora do código e .env ignorados.
- [x] Validação de origem, payload e limites implementados.
- [x] Ollama local e métricas agregadas persistentes conferidos pelo link público.
- [x] Supabase: RLS, anon sem escrita/função de atualização e sem acesso a versões/relatórios.
- [x] Atualização transacional/versões testadas com rollback.
- [x] Lint, TypeScript, testes e build registrados em verification.md.
- [x] Auditoria de produção sem vulnerabilidades; cinco alertas de desenvolvimento avaliados.
- [x] Gitleaks e Semgrep executados; único achado Semgrep é HTTP loopback do benchmark, avaliado.
- [x] OWASP ZAP no ambiente de teste, sem High/Medium/Low na versão com base/painel; cobertura limitada registrada.
- [x] Endereço PT/EN com fonte e CEP ausente com abstenção. Respostas naturais com referências ao final, conforme pedido posterior do usuário.
- [ ] Avaliação ampla PT/EN, memória, paráfrases e fidelidade factual.
- [ ] Primeira varredura histórica integral concluída e pendências revisadas.
- [ ] OCR/revistas externas incluídos quando necessários.
- [x] Coletor oculto ativo com checkpoints/envios avançando e tarefa AtLogOn criada.
- [ ] Reinício físico/logon e carga com 5–10 participantes verificados.
- [x] Responsividade desktop/mobile inspecionada; controles com labels e foco. Teste completo de teclado ainda pendente.
- [ ] GitHub/CI executados e PR revisado.
- [x] URL temporária da apresentação confirmada; operação permanente ainda exige revisão.
- [ ] Responsável por incidentes designado.
- [ ] Preview validado antes de publicação definitiva.

## Opção de voz — 10/10/2026

- [x] Microfone restrito ao próprio site, ativação opcional com aviso de processamento pelo navegador; câmera desabilitada.
- [x] Sem gravações recebidas/persistidas pela SINDI; métricas continuam agregadas.
- [x] Texto de referência removido da leitura, captura pausada durante resposta e cancelamento ao ocultar a página.
- [x] Vinte testes, lint/typecheck/build; Gitleaks e Semgrep sem achados na revisão de voz; audit de produção sem vulnerabilidades.
- [x] ZAP no teste local sem High/Medium/Low; limites de cobertura documentados.
- [ ] Microfone/áudio/retomada automática verificados em Android e iPhone físicos.
- [ ] Latência quase instantânea demonstrada no hardware atual.
