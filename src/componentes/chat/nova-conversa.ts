// Sem dependências: o cabeçalho (que dispara) e a conversa (que escuta) compartilham só o nome do evento.

/** Evento que o cabeçalho dispara e a página inicial escuta para limpar a conversa. */
export const NOVA_CONVERSA = 'sindi-nova-conversa';
/** Evento que o cabeçalho dispara (no celular) para abrir a gaveta de conversas anteriores. */
export const ABRIR_CONVERSAS = 'sindi-abrir-conversas';
