// Sem dependências de React: usado pelas páginas da biblioteca (servidor) e pelos componentes dela.

/** Data (e, se pedido, hora) no horário de São Paulo; valor ausente ou inválido vira travessão. */
export function data(valor?: string, comHora = false) {
  if (!valor) return '—';
  const momento = new Date(valor);
  if (Number.isNaN(momento.getTime())) return '—';
  return momento.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** Endereço com parâmetros de consulta; valores vazios são omitidos, e a página 1 também (é o padrão). */
export function endereco(base: string, parametros: Record<string, string | number | undefined>) {
  const consulta = new URLSearchParams();
  for (const [nome, valor] of Object.entries(parametros)) {
    const omitir = valor === undefined || valor === '' || (nome === 'pagina' && Number(valor) <= 1);
    if (!omitir) consulta.set(nome, String(valor));
  }
  const texto = consulta.toString();
  return texto ? `${base}?${texto}` : base;
}
