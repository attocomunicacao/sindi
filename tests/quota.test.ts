import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotaMessage } from '../src/lib/quota';
test('shows provider daily quota and retry time without including raw error or secrets', () => {
  const message = quotaMessage(JSON.stringify({ error: { message: 'secret-credential', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] }, { retryDelay: '77946s' }] } }));
  assert.match(message, /20 requisições por dia/); assert.match(message, /21h 40min/); assert.doesNotMatch(message, /secret-credential/);
  assert.match(quotaMessage('invalid'), /Tente mais tarde/);
});
