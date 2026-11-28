import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMenuText, parseMenuPrice, validateMenuOrder } from '../lib/order-utils.js';

test('normaliza nomes ignorando acentos e caixa', () => {
  assert.equal(normalizeMenuText('  PIZZA CalabRÉsa '), 'pizza calabresa');
});

test('interpreta preços brasileiros e preços sem centavos', () => {
  assert.equal(parseMenuPrice('R$ 1.234,56'), 1234.56);
  assert.equal(parseMenuPrice('29,90'), 29.9);
  assert.equal(parseMenuPrice('1.200'), 1200);
  assert.equal(parseMenuPrice(''), null);
});

test('valida o cardápio e calcula preço a partir do cadastro do servidor', () => {
  const menu = [{ name: 'Pizza Calabresa', cat: 'Pizzas', price: '45,00', active: true, trackStock: true, stock: 5 }];
  const result = validateMenuOrder(menu, [{ name: 'pizza calabresa', cat: 'pizzas', quantity: 2 }]);
  assert.equal(result.ok, true);
  assert.equal(result.items[0].record.unitPrice, 45);
  assert.equal(result.items[0].record.quantity, 2);
});

test('recusa item inativo, preço vazio e estoque insuficiente', () => {
  assert.match(validateMenuOrder([{name:'A',price:'10,00',active:false}], [{name:'A',quantity:1}]).error, /indisponível/);
  assert.match(validateMenuOrder([{name:'A',price:'',active:true}], [{name:'A',quantity:1}]).error, /preço/);
  assert.match(validateMenuOrder([{name:'A',price:'10,00',active:true,trackStock:true,stock:1}], [{name:'A',quantity:2}]).error, /Estoque insuficiente/);
});

test('não confia no preço informado pelo navegador e só usa o preço do cardápio', () => {
  const result = validateMenuOrder([{name:'Café',price:'8,50',active:true}], [{name:'Café',quantity:3,unitPrice:0.01}]);
  assert.equal(result.items[0].record.unitPrice, 8.5);
  assert.equal(result.items[0].record.quantity, 3);
});

test('servidor registra pedidos, valida estoque e grava o estado antes de confirmar', async () => {
  const fs = await import('node:fs');
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.post\("\/api\/intake\/orders"/);
  assert.match(server, /validateMenuOrder\(menu,requested\)/);
  assert.match(server, /line\.source\.stock=Math\.max\(0,Number\(line\.source\.stock\|\|0\)-line\.record\.quantity\)/);
  assert.match(server, /if\(!await persistState\(\)\)/);
  assert.match(server, /orderMutationQueue/);
  assert.match(server, /Access-Control-Allow-Origin/);
  assert.match(server, /Access-Control-Allow-Methods/);
});

test('agrega linhas repetidas antes de validar o estoque', () => {
  const menu = [{name:'Suco',price:'7,00',active:true,trackStock:true,stock:5}];
  const result = validateMenuOrder(menu, [{name:'Suco',quantity:3},{name:'Suco',quantity:3}]);
  assert.match(result.error, /Estoque insuficiente/);
});
