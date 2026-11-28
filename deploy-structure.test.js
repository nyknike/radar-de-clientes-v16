import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const requiredModules = [
  "../lib/site-builder.js",
  "../lib/order-utils.js",
  "../config/integrations.js",
];

test("todos os módulos importados pelo servidor existem no pacote", () => {
  for (const modulePath of requiredModules) {
    assert.equal(fs.existsSync(new URL(modulePath, import.meta.url)), true, `Módulo ausente: ${modulePath}`);
  }
});
