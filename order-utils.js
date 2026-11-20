export function normalizeMenuText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function parseMenuPrice(value) {
  const raw = String(value ?? "").trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(",")) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

export function validateMenuOrder(menu, requested) {
  const grouped = new Map();
  for (const line of requested) {
    const item = (Array.isArray(menu) ? menu : []).find(x =>
      normalizeMenuText(x?.name) === normalizeMenuText(line.name) &&
      (!line.cat || normalizeMenuText(x?.cat) === normalizeMenuText(line.cat))
    );
    if (!item) return { ok: false, error: `O item “${line.name}” não está mais disponível no cardápio. Atualize a página e tente novamente.` };
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(line.quantity) || 1)));
    const current = grouped.get(item);
    if (current) current.quantity = Math.min(999, current.quantity + quantity);
    else grouped.set(item, { item, quantity, options: String(line.options || "").slice(0, 500) });
  }

  const validated = [];
  for (const { item, quantity, options } of grouped.values()) {
    if (item.active === false) return { ok: false, error: `“${item.name}” está indisponível no momento.` };
    const unitPrice = parseMenuPrice(item.price);
    if (unitPrice === null) return { ok: false, error: `O preço de “${item.name}” precisa ser confirmado pelo estabelecimento.` };
    if (item.trackStock && Number(item.stock || 0) < quantity) return { ok: false, error: `Estoque insuficiente para “${item.name}”. Disponível: ${Math.max(0, Number(item.stock) || 0)}.` };
    validated.push({ source: item, record: { name: String(item.name).slice(0, 160), cat: String(item.cat || "").slice(0, 80), quantity, unitPrice, options } });
  }
  return { ok: true, items: validated };
}
