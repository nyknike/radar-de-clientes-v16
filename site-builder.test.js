import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGeneratedSite } from "../lib/site-builder.js";

test("normaliza estrutura gerada e remove preços inventados", () => {
  const site = normalizeGeneratedSite({
    title: "Forno da Vila", description: "Pizzas artesanais", aboutText: "Feitas com cuidado",
    c1: "#123456", c2: "red", enabledSections: ["about", "faq", "script"],
    items: [{ cat: "Pizzas", name: "Margherita", price: "R$ 99,90", desc: "Tomate e queijo" }],
    faqItems: [{ q: "Entrega?", a: "Consulte a loja." }, { q: "", a: "inválido" }]
  }, { name: "Forno da Vila", brief: "Pizzaria artesanal", style: "modern" });
  assert.equal(site.title, "Forno da Vila");
  assert.equal(site.items[0].price, "");
  assert.deepEqual(site.enabledSections, ["about", "faq"]);
  assert.equal(site.c1, "#123456");
  assert.equal("c2" in site, false);
  assert.equal(site.faqItems.length, 1);
});

test("limita coleções e comprimentos do conteúdo", () => {
  const site = normalizeGeneratedSite({
    title: "T".repeat(300), description: "D".repeat(2000),
    items: Array.from({ length: 25 }, (_, i) => ({ name: `Item ${i}`, desc: "x".repeat(500) })),
    faqItems: Array.from({ length: 12 }, (_, i) => ({ q: `Pergunta ${i}`, a: "a".repeat(500) }))
  }, { name: "Loja", brief: "Descrição da loja", style: "invalid" });
  assert.equal(site.title.length, 180);
  assert.equal(site.description.length, 1200);
  assert.equal(site.items.length, 16);
  assert.equal(site.items[0].desc.length, 300);
  assert.equal(site.faqItems.length, 6);
  assert.equal(site.faqItems[0].a.length, 350);
  assert.equal(site.visualStyle, "auto");
});

test("rejeita resposta sem itens ou sem objeto JSON", () => {
  assert.throws(() => normalizeGeneratedSite({ title: "Site", description: "Descrição", items: [] }, { name: "Site", brief: "Descrição longa" }), /pelo menos um item/);
  assert.throws(() => normalizeGeneratedSite(null, { name: "Site", brief: "Descrição longa" }), /objeto JSON/);
});
