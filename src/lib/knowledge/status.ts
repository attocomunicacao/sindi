import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function knowledgeStatus() {
  try {
    const status = JSON.parse(await readFile(path.join(process.cwd(), '.data/knowledge/status.json'), 'utf8'));
    return { available: true, phase: status.phase, startedAt: status.startedAt, finishedAt: status.finishedAt,
      heartbeatAt: status.heartbeatAt, discovered: status.discovered, checked: status.checked, documents: status.documents,
      uploaded: status.uploaded, cloudConfigured: status.cloudConfigured, cloudErrors: status.cloudErrors,
      incomplete: status.incomplete, failureCount: status.failures?.length || 0, externalCount: status.externalLinks?.length || 0,
      intervalMinutes: status.intervalMinutes };
  } catch { return { available: false }; }
}
