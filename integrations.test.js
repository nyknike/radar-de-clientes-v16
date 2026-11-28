import test from 'node:test';
import assert from 'node:assert/strict';
import { getIntegrationStatus, testIntegration } from '../config/integrations.js';

test('status das integrações não expõe valores secretos', () => {
  const old = { ...process.env };
  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-value';
    process.env.OPENROUTER_API_KEY = 'another-secret';
    const status = getIntegrationStatus();
    const serialized = JSON.stringify(status);
    assert.equal(status.supabase.configured, true);
    assert.equal(status.openrouter.configured, true);
    assert.equal(serialized.includes('secret-value'), false);
    assert.equal(serialized.includes('another-secret'), false);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
    for (const [key, value] of Object.entries(old)) process.env[key] = value;
  }
});

test('provedor desconhecido falha sem revelar segredo', async () => {
  const result = await testIntegration('unknown-provider');
  assert.equal(result.ok, false);
  assert.match(result.message, /Sistema desconhecido/);
});
