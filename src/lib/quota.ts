export function quotaMessage(responseBody?: string) {
  const base = 'A cota gratuita do Gemini foi atingida.';
  try {
    const details = JSON.parse(responseBody || '{}').error?.details;
    if (!Array.isArray(details)) return `${base} Tente mais tarde.`;
    const violation = details.flatMap(d => Array.isArray(d.violations) ? d.violations : []).find(v => typeof v.quotaId === 'string' && v.quotaId.includes('RequestsPerDay'));
    const limit = Number(violation?.quotaValue);
    const delay = details.find(d => typeof d.retryDelay === 'string')?.retryDelay;
    const seconds = typeof delay === 'string' && /^\d+(\.\d+)?s$/.test(delay) ? Math.ceil(Number(delay.slice(0, -1))) : 0;
    const minutes = Math.ceil(seconds / 60);
    const wait = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min` : `${minutes}min`;
    return `${violation ? 'A cota diária gratuita do Gemini foi atingida.' : base}${Number.isSafeInteger(limit) && limit > 0 ? ` O limite informado é de ${limit} requisições por dia para este modelo, compartilhadas por todos os usuários do projeto.` : ''}${seconds > 0 ? ` O Google orienta tentar novamente em aproximadamente ${wait}.` : ' Tente mais tarde.'}`;
  } catch { return `${base} Tente mais tarde.`; }
}
