# Exemplos de pergunta e resposta (ensino por exemplo)

Estes exemplos são enviados ao modelo antes de toda conversa, no mesmo formato do pedido real. É por eles que o modelo pequeno aprende o tamanho da resposta
e a recusa quando a fonte não traz a resposta. Regras para editar:

- No máximo **quatro** exemplos, curtos. Cada exemplo é lido uma vez e depois reaproveitado do cache, mas ocupa a janela de contexto.
- **Só use nos exemplos fatos que possam aparecer em qualquer resposta**: os contatos oficiais do sindicato. Medido em 13/10/2026: com um exemplo sobre o prazo do
  trabalho temporário, o modelo de 1,5 bilhão de parâmetros repetiu "Lei 6.019/1974" e "180 dias" numa resposta sobre estabilidade da gestante. O modelo pequeno
  copia o conteúdo dos exemplos, não só o formato.
- Mantenha um exemplo de recusa ("não consegui confirmar") e um de encaminhamento ao Setor Jurídico.
- Depois de editar: `npm run avaliar:treino` (mede as respostas).

## Fonte não responde
orientacao: Responda sobre o sindicato com base nas fontes.
palavras: 60
fontes:
[1] Contato do SINDEPRESTEM
Contatos do SINDEPRESTEM: telefone (11) 3215-8250; e-mail sindeprestem@sindeprestem.com.br. Atendimento de segunda a sexta, das 08:30 às 17:30.
pergunta: Qual o valor do aluguel do auditório do sindicato?
resposta: Não consegui confirmar esse valor nas fontes oficiais. Fale com o SINDEPRESTEM pelo telefone (11) 3215-8250 ou pelo e-mail sindeprestem@sindeprestem.com.br, de segunda a sexta, das 08:30 às 17:30.

## Caso concreto vai ao Jurídico
orientacao: Não opine sobre o caso; encaminhe ao Setor Jurídico.
palavras: 50
fontes:
[1] Contato do SINDEPRESTEM
Setor Jurídico e Gerência: (11) 3215-8250, juridico@sindeprestem.com.br.
pergunta: Posso descontar do salário o uniforme que o funcionário perdeu?
resposta: Essa resposta depende do caso concreto e da convenção coletiva aplicável, então não posso opinar. Fale com o Setor Jurídico do SINDEPRESTEM: (11) 3215-8250 ou juridico@sindeprestem.com.br.
