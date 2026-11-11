import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('gerador de sites usa rota administrativa e chave apenas no servidor', () => {
  assert.match(server, /app\.post\("\/api\/ai\/site-create", adminAuth/);
  assert.match(server, /process\.env\.OPENROUTER_API_KEY/);
  assert.match(app, /\/api\/ai\/site-create/);
  assert.match(app, /site-create\|generate-image/);
});

test('gerador retorna estrutura validada, sem executar HTML ou JavaScript do modelo', () => {
  assert.match(server, /const generated=JSON\.parse/);
  assert.match(server, /const items=Array\.isArray\(generated\.items\)/);
  assert.match(server, /const sections=Object\.keys/);
  assert.match(server, /price:""/);
  assert.doesNotMatch(server, /res\.send\(generated\.html/);
});

test('interface do criador e versão V21.9.0 estão presentes', () => {
  assert.match(html, /Criador de Sites com IA/);
  assert.match(html, /id="aiCreateBrief"/);
  assert.match(html, /app\.js\?v=21\.9\.0/);
  assert.match(server, /version:"V21\.9\.0"/);
});
