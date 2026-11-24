---
titulo: Ferramentas da SINDI
tipo: curado
prioridade: 2
gatilhos: diagnóstico de exposição, diagnóstico, semáforo, plano de ação, jornada 42, kit jornada 42, impacto da jornada 42, ferramenta, painel, cérebro, grafo, rede de conhecimento, orçamento, orçamento de terceirização, cotação, quanto custa terceirizar, pdf, relatório de custo, indicadores, calcular, estimativa, encargos, custo de funcionário, custo por funcionário, posto de trabalho, danfse, nfs-e, nota fiscal de serviço, calculadora de tributos, conferir com a receita
atualizado: 2026-11-24
---

# Ferramentas da SINDI

## Painel do setor (/painel)
Mostra indicadores atualizados (meta Selic, IPCA, desemprego, volume de serviços e saldo do Novo CAGED), notícias e artigos do SINDEPRESTEM, projetos de lei sobre terceirização e trabalho temporário na Câmara e no Senado, notícias do TST, WEC, IBGE e Ministério do Trabalho, e a situação da coleta de cada fonte. Os dados vêm de fontes públicas oficiais e são coletados a cada 30 minutos neste computador.

## Orçamento de terceirização (/orcamento)
Ferramenta para empresas que contratam mão de obra terceirizada. O usuário escolhe os postos (por exemplo, 3 auxiliares de limpeza diurno e 3 noturno) e vê o custo mensal e anual estimado, o custo médio por funcionário e, se informar a área, o custo por m². O resultado é custo, não preço: BDI, lucro e tributos do preço são informados por quem usa a ferramenta. Baixa dois PDFs: o **orçamento** e o **relatório de custo detalhado**. Também funciona pelo chat: "preciso de um orçamento para 3 auxiliares de limpeza diurno e 3 noturno".

### O que entra no custo
Salário da função (tabela de referência), adicionais de periculosidade (30%) ou insalubridade (não se acumulam: entra o maior, conforme o art. 193, § 2º, da CLT) e noturno (20% mais descanso semanal remunerado), horas extras; encargos sociais e trabalhistas (84,24% sobre a folha); benefícios (vale-refeição, vale-transporte líquido de 6% de desconto do empregado, cesta básica, assistência social familiar, seguro de vida); PCMSO e PPR; uniformes e EPIs. O custo é calculado; BDI, lucro e tributos (ISS de 2% a 5% conforme o município, PIS, COFINS, contribuição social, IRPJ) são informados por quem usa, e em branco valem zero. Opcionalmente, produtos, equipamentos e serviços.

### Cuidados
- É uma estimativa baseada em uma tabela de referência de custos (não é proposta comercial). Os valores devem ser confirmados com a convenção coletiva vigente da categoria.
- As funções de limpeza seguem a convenção de asseio e conservação, que não é a convenção do SINDEPRESTEM.
- Funções sem salário na tabela ficam "sob consulta": auxiliar de atendimento, fiscal de piso, oficial de manutenção e hidráulica, bombeiro civil, eletricista de manutenção, limpador de vidros e mensageiro.
- O turno noturno usa, por padrão, 180 horas noturnas por funcionário por mês (editável).
- Nada é gravado: os dados digitados servem apenas para montar o PDF.

## Calculadora de tributos (/tributos) e a tributação do orçamento
A calculadora tem três abas, e a conta de cada uma roda no navegador (nada é enviado para calcular): CBS e IBS de um serviço no regime regular (Reforma Tributária), o DAS do Simples Nacional (Anexos III, IV e V, com faixas, alíquota efetiva, partilha entre os tributos e Fator R) e a CBS/IBS dentro do Simples. Cada resultado traz a memória de cálculo. O orçamento (/orcamento) tem um seletor de tributação: regras atuais (padrão), Reforma Tributária (ano de 2026 a 2033) ou Simples Nacional, com a comparação entre as regras atuais e a escolhida.
- Em 2026 a CBS (0,90%) e o IBS (0,10%) são de teste: aparecem na nota, sem custo. A partir de 2027 a Receita não publicou as alíquotas: a ferramenta usa uma estimativa editável e marca o cálculo como simulado; o usuário deve informar as alíquotas definitivas.
- Na transição, o PIS e a COFINS deixam de existir em 2027 e o ISS cai a 90% (2029), 80% (2030), 70% (2031), 60% (2032) e acaba em 2033. CBS e IBS são cobrados por fora do preço; o tomador no regime regular aproveita o crédito.
- No Simples, a tributação informada usa a alíquota efetiva do DAS; no Anexo IV a contribuição patronal fica fora do DAS. A cessão de mão de obra só é permitida no Simples nas atividades de vigilância, limpeza, conservação e construção (Anexo IV). A partilha do Simples a partir de 2027 ainda não está implementada, e as tabelas do DAS devem ser conferidas com a LC 123/2006 antes de uso comercial.
- O botão "Conferir com a calculadora da Receita" (abas do regime regular e do Simples) pede ao servidor o mesmo cálculo na calculadora oficial da Receita Federal e diz se os valores são idênticos. Só vão ao servidor os números do cálculo (ano, valor, serviço, alíquotas), nunca dados pessoais. A conferência só funciona quando o servidor tem a calculadora oficial ligada; sem ela, o botão avisa e a conta da SINDI vale sozinha. No Simples ela cobre os Anexos III, IV e V, com a receita inteira tributada e o ISS dentro do Simples.
- Em testes da equipe, a conta da SINDI deu exatamente os mesmos centavos que as calculadoras oficiais da Receita (regime regular e Simples) nos serviços do catálogo (mão de obra, vigilância, limpeza e o exemplo de profissão intelectual com redução de 30%). Isso vale para 2026, único ano com alíquotas oficiais; de 2027 a 2033 o cálculo continua sendo simulado com as alíquotas estimadas ou informadas.
- Gerar DANFSe (/danfse): o usuário envia o XML da NFS-e nacional e baixa o DANFSe (Documento Auxiliar da NFS-e) em PDF, no leiaute do gerador oficial da Receita. O XML é processado em memória e não é gravado. Em testes, o texto do PDF saiu igual ao do gerador oficial em 19 casos (situação da nota, homologação, campos ausentes, textos longos e XML inválido). Não é um produto oficial da Receita: o usuário deve conferir o resultado antes de usá-lo como documento fiscal.
- É uma estimativa para planejamento; não substitui contador nem parecer jurídico.

## Kit Jornada 42 (/jornada-42)
Kit para a Emenda Constitucional 141/2026 (jornada de 42 horas a partir de 16/12/2026 e de 40 horas a partir de 16/12/2027, com 2 dias de repouso semanal e sem redução salarial). Tem três blocos, todos calculados e montados no navegador, sem guardar nada: (1) roteiro por perfil de empresa (prestadora com contratos públicos, prestadora com contratos privados, empresa de trabalho temporário, empresa com escala 12x36 ou turnos): o usuário marca o que se aplica e recebe os passos em ordem, cada um com o artigo da emenda; (2) impacto no custo do posto: a partir do salário mensal (e, se quiser, das horas extras de 50% e 100% e do adicional noturno de 20%), mostra o salário-hora nos divisores 220 (jornada atual de 44 horas), 210 (42 horas) e 200 (40 horas, conforme o Decreto nº 13.173/2026), a variação percentual e os valores de hora extra e adicional noturno; no exemplo do Planalto, salário de R$ 3.000, a hora vai de R$ 13,64 para R$ 14,29 (42 horas) e R$ 15,00 (40 horas); (3) modelos de comunicado ao tomador de serviços e aos empregados, com o nome da empresa, em texto para copiar. Também funciona pelo chat: "qual o impacto da jornada 42 no posto?".
- É custo, nunca preço: a ferramenta não sugere preço nem margem. Pode ser usada junto com o orçamento (/orcamento), que ela não altera.
- O texto da emenda não menciona a terceirização nem o trabalho temporário como tais; o kit só aplica as regras gerais do texto. Os modelos são gerais e devem ser revisados com o jurídico; o caso concreto vai ao Setor Jurídico do SINDEPRESTEM.
- Conteúdo válido até 31/12/2026, por causa da regulamentação do Ministério do Trabalho e de leis complementares. Os fatos da emenda estão em "Emenda Constitucional 141 e a Jornada 42".

## Diagnóstico de Exposição (/diagnostico)
Questionário de 15 perguntas, em 5 temas (jornada e repouso; normas coletivas, compensação e salário-hora; contratos com clientes; empresas contratadas e responsabilidade; segurança e saúde no trabalho). Cada pergunta mostra a fonte oficial de onde vem (Emenda Constitucional 141/2026, Lei 6.019/1974, CLT, Portaria do Ministério do Trabalho e NR-1 e NR-6, com o artigo ou item). Para cada resposta há uma pontuação simples: sim vale 0, em parte 1, não 2, não sei 2 e não se aplica 0. Cada tema recebe um semáforo (verde de 0 a 1 ponto, amarelo de 2 a 3, vermelho de 4 a 6) e as respostas que não são "sim" viram um plano de ação, com as mais urgentes primeiro. O resultado pode ser impresso ou salvo em PDF pelo navegador.
- Tudo é calculado no navegador do usuário: as respostas não são enviadas, não passam pelo servidor, não são guardadas e somem ao recarregar a página. A ferramenta não funciona pelo chat, justamente para que nada do que a empresa responde saia do aparelho dela.
- É informação geral e orientação, nunca parecer nem consultoria; um semáforo verde não garante conformidade. O caso concreto vai ao Setor Jurídico do SINDEPRESTEM. Não recomenda preço nem margem.
- Conteúdo atualizado em 24/11/2026 e válido até 31/12/2026, por causa da regulamentação do Ministério do Trabalho.

## Cérebro da SINDI (/cerebro)
Mostra, em forma de rede, tudo o que a SINDI consulta para responder: os especialistas de cada área, as estantes da biblioteca, o conhecimento escrito pela equipe, os documentos coletados e as leis, normas regulamentadoras e projetos de lei que ligam esses documentos. Tem dois modos: a rede de conhecimento (com busca e filtros) e a arquitetura do sistema, que mostra o caminho de uma pergunta até a resposta verificada. Clicar num ponto mostra as ligações dele e abre o documento na biblioteca.

## Chat
Responde com base nas informações coletadas, sempre que possível citando a fonte. Perguntas sobre contatos, contribuições, convenções, cartilhas, documentos jurídicos, notícias, artigos, indicadores, projetos de lei, artigos da Constituição e dos regimentos e Normas Regulamentadoras são respondidas diretamente com o texto ou os dados da fonte. Também há o modo conversa por voz.
