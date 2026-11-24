## Resumo
<!-- O que muda e por quê, em poucas linhas. Em PR empilhado, diga sobre qual PR ele parte. -->

## Verificação
- [ ] `npm run lint`, `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build` e `npm audit --audit-level=high`
- [ ] `npm run test:e2e` (se mexeu em interface)
- [ ] `npm run verificar:funcional` com o servidor rodando (se mexeu em rotas ou ferramentas)

## Segurança (marque o que se aplica ou escreva "não se aplica")
- [ ] Toda rota nova usa a guarda de `src/lib/http/guarda.ts` (origem, tipo, limite por minuto, tamanho do corpo)
- [ ] Entrada validada por schema; nenhum segredo no código, no log, na URL ou no navegador
- [ ] Links externos passam por `linkSeguro`; busca na rede valida o destino (https, sem IP interno)
- [ ] Dados pessoais não chegam ao provedor de IA nem aos logs; há caso hostil nos testes de ataque

## Não verificado
<!-- O que não foi testado e por quê (navegador, leitor de tela, CI, publicação atrás do túnel...). Seja específico. -->
