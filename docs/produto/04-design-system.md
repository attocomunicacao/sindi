# Design

Minimalista e corporativo. Cores em tokens (`globals.css`): grafite #2D2727, dourado #EBB92E, vermelho #B61323 (logo), fundos quentes; tema escuro por inversão de tokens, contraste ≥ 4,5:1. Fonte do sistema (Segoe UI, system-ui), sem fonte externa.

## Escala tipográfica
Base 16 px, razão ≈ 1,25 (terça maior), arredondada ao múltiplo de 4 px; entrelinha também múltipla de 4 px. Padrão usado por Material, Carbon e Atlassian: papéis nomeados, tamanhos em rem, nunca valores soltos (`text-[13px]` é proibido).

| Token | Tamanho / entrelinha | Uso |
|---|---|---|
| `text-xs` | 12 / 16 | legendas, notas, rótulos |
| `text-sm` | 14 / 20 | controles, botões, tabelas, corpo secundário |
| `text-base` | 16 / 24 | corpo de texto, campo de mensagem |
| `text-lg` | 20 / 28 | subtítulos de seção |
| `text-xl` | 24 / 32 | títulos de bloco |
| `text-2xl` | 32 / 40 | título de página |
| `text-3xl` | 40 / 48 | valores em destaque |
| `text-4xl`–`text-5xl` | 48 / 56 e 56 / 64 | título da tela inicial |

Pesos: 400 corpo, 500 controles, 600 títulos. Tracking: `tracking-tight` só em títulos ≥ 32 px.

## Espaçamento e dimensões
Grade de 4 px (`--spacing` do Tailwind), com preferência por múltiplos de 8 (8, 16, 24, 32, 48). Altura mínima de controle 40 px (`min-h-10`); botões crescem em altura se o rótulo quebrar linha, nunca estouram o texto. Coluna do assistente 768 px; conteúdo de páginas internas 768–1152 px; painel lateral do orçamento 360 px. Breakpoints do Tailwind (640, 768, 1024).

## Estados
Foco visível (contorno dourado de 2 px), desabilitado (40 % de opacidade), carregamento (ícone giratório) e erro (caixa âmbar com `role="alert"`). Animações de 200–500 ms, desligadas com `prefers-reduced-motion`.
