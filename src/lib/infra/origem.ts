// A reverse proxy preserves the browser's Origin while changing Host upstream.
// Trust one explicit server configuration, never client-supplied forwarded hosts.
export function allowedChatOrigin(origin: string | null, expectedHost: string, publicOrigin = '', vercel = false): boolean {
  try {
    const parsed = new URL(origin || '');
    if (!['http:', 'https:'].includes(parsed.protocol) || (vercel && parsed.protocol !== 'https:')) return false;
    if (origin !== parsed.origin) return false;
    if (parsed.host === expectedHost) return true;
    return parsed.protocol === 'https:' && Boolean(publicOrigin) && parsed.origin === publicOrigin;
  } catch { return false; }
}
