# Publicação do protótipo com IA no computador

Decisão do usuário: demonstração em celulares, sem instalar Ollama nos visitantes. Um computador ficará ligado para executar o modelo. Ainda não existe conta Cloudflare.

Arquitetura recomendada para manter a versão atual:
Celular -> HTTPS Cloudflare Tunnel -> SINDI Next.js no computador -> Ollama em 127.0.0.1:11434.

O túnel aponta para o servidor SINDI, nunca diretamente para o Ollama. Assim preserva validação de entrada, instruções institucionais, fila do processo, streaming e métricas locais agregadas. Não precisa Redis externo neste arranjo. Executar build e npm start para a demonstração, não publicar next dev. Manter acesso local em paralelo.

Opções:
- Quick Tunnel: endereço temporário aleatório trycloudflare.com, sem conta/domínio, para avaliação. Não possui garantia de disponibilidade, muda ao recriar e não é opção estável de produção. Não suporta SSE; SINDI usa NDJSON, cujo streaming ainda deve ser testado através do túnel antes da apresentação.
- Tunnel com hostname fixo: conta Cloudflare, domínio sob gestão e configuração do túnel/serviço. Não comprar domínio nem aceitar contratos pelo usuário. Nenhuma conta, instalação ou exposição pública realizada nesta etapa.

Operação: computador ligado, sem suspensão durante apresentação, internet estável, Ollama e servidor SINDI ativos. Sem cota do Gemini; velocidade e concorrência dependem do computador. Em um único processo, uma geração por vez; 5–10 pessoas simultâneas podem aguardar. O gráfico é público e agregado no mesmo computador.

Pré-publicação: concluir checklist do Guia Operacional, verificar segredos sem imprimir seus valores, avaliar alertas npm, executar ferramentas de segurança previstas e verificar o fluxo público em celular. Não habilitar planos pagos. Não alterar cotas, memória, design nem scroll nesta etapa.

Pendência: confirmar se o computador dedicado será o mesmo i7/16GB/Iris Xe. Escolher URL temporária de apresentação ou endereço fixo após criação de conta e disponibilidade de domínio.

Referências: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ ; https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/ .
