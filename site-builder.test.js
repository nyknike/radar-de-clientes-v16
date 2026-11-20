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
  assert.match(server, /preserveExplicitPrice/);
  assert.doesNotMatch(server, /res\.send\(generated\.html/);
});

test('interface do criador e versão V21.13.0 estão presentes', () => {
  assert.match(html, /CRIADOR DE SITES COM IA/);
  assert.match(html, /id="aiCreateBrief"/);
  assert.match(html, /app\.js\?v=21\.13\.0/);
  assert.match(server, /version:"V21\.13\.0"/);
});

test('módulo ausente no deploy exporta normalizador e valida dados de IA', async () => {
  const { normalizeGeneratedSite } = await import('../lib/site-builder.js');
  const project = normalizeGeneratedSite({
    title: 'Site de teste', tagline: 'Atendimento de qualidade', aboutText: 'Nossa história',
    highlights: [{title:'Destaque A',desc:'Descrição A'},{title:'Destaque B',desc:'Descrição B'}],
    faqItems: [{q:'Como falar?',a:'Pelo contato informado.'}],
    c1: '#112233', items: [
      { name: 'Serviço A', price: 'R$ 999' }, { name: 'Serviço B' }
    ], sections: ['about', 'items']
  }, { name: 'Negócio teste', brief: 'Descrição suficiente para o teste' });
  assert.equal(project.name, 'Negócio teste');
  assert.equal(project.items.length, 2);
  assert.equal(project.items[0].price, '');
  assert.equal(project.tagline, 'Atendimento de qualidade');
  assert.equal(project.highlights.length, 2);
  assert.equal(project.faqItems.length, 1);
  assert.equal(project.sections.find(x => x.k === 'items').on, true);
  assert.throws(() => normalizeGeneratedSite({ items: [] }, { name: 'Teste' }), /menos de dois/);
});

test('cardápio preserva produtos antigos e filtra indisponíveis/estoque zerado', () => {
  assert.match(app, /trackStock:!!i\.trackStock/);
  assert.match(app, /stock:Math\.max\(0,Number\(i\.stock\)\|\|0\)/);
  assert.match(app, /i\.active!==false&&\(!i\.trackStock\|\|Number\(i\.stock\)>0\)/);
  assert.match(app, /data-p="items\.\$\{i\}\.active"/);
  assert.match(app, /data-p="items\.\$\{i\}\.trackStock"/);
});


test('integra criação contextual e três prompts por categoria', () => {
  assert.match(app, /data-ai-site="\$\{b\.id\}"/);
  assert.match(app, /if\(!aiSelectedBusiness\)/);
  assert.match(app, /AI_PROMPT_PROFILES/);
  assert.match(app, /title:"1\. Premium e sofisticado"/);
  assert.match(app, /title:"2\. Moderno e comercial"/);
  assert.match(app, /title:"3\. Autêntico e marcante"/);
  assert.match(app, /data-ai-prompt/);
  assert.match(app, /sourceBusinessId:aiSelectedBusiness\.id/);
  assert.doesNotMatch(html, /id="openAICreator"/);
  assert.match(html, /id="aiPromptOptions"/);
});


test('gera conteúdo contextual adicional e o renderiza sem dados inventados', () => {
  assert.match(server, /aboutText:String\(generated\.aboutText/);
  assert.match(server, /highlights:Array\.isArray\(generated\.highlights\)/);
  assert.match(server, /faqItems:Array\.isArray\(generated\.faqItems\)/);
  assert.match(server, /Adapte a hierarquia e a linguagem ao setor/);
  assert.match(app, /site-highlights/);
  assert.match(app, /p\.faqItems\.slice\(0,5\)/);
  assert.match(app, /data-p="aboutText"/);
  assert.match(app, /data-p="tagline"/);
});

test('edição conversacional aceita alterações em destaques e FAQ', () => {
  assert.match(server, /if\(Array\.isArray\(parsed\.highlights\)\) patch\.highlights/);
  assert.match(server, /if\(Array\.isArray\(parsed\.faqItems\)\) patch\.faqItems/);
  assert.match(app, /if\(Array\.isArray\(patch\.highlights\)\)ed\.highlights/);
  assert.match(app, /if\(Array\.isArray\(patch\.faqItems\)\)ed\.faqItems/);
});

test('preços gerados só são mantidos quando foram explicitamente informados', async () => {
  const { preserveExplicitPrice } = await import('../lib/site-builder.js');
  assert.equal(preserveExplicitPrice('R$ 49,90', 'Pizza grande por R$ 49,90'), 'R$ 49,90');
  assert.equal(preserveExplicitPrice('R$ 59,90', 'Pizza grande por R$ 49,90'), '');
});
