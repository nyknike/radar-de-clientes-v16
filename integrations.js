const present = (name) => Boolean(String(process.env[name] || "").trim());

export function getIntegrationStatus() {
  return {
    supabase: { configured: present("SUPABASE_URL") && present("SUPABASE_SERVICE_ROLE_KEY"), variables: { url: present("SUPABASE_URL"), serviceRoleKey: present("SUPABASE_SERVICE_ROLE_KEY") } },
    openrouter: { configured: present("OPENROUTER_API_KEY"), model: process.env.OPENROUTER_MODEL || "openrouter/free" },
    cloudflare: { configured: present("CLOUDFLARE_API_TOKEN") && present("CLOUDFLARE_ACCOUNT_ID"), variables: { apiToken: present("CLOUDFLARE_API_TOKEN"), accountId: present("CLOUDFLARE_ACCOUNT_ID") }, pagesProject: process.env.CLOUDFLARE_PAGES_PROJECT || "radar-clientes-sites" },
    mercadopago: { configured: present("MP_ACCESS_TOKEN"), publicBaseUrlConfigured: present("PUBLIC_BASE_URL"), webhook: "recepção básica; assinatura e atualização automática de pagamentos ainda precisam ser implementadas" },
    admin: { configured: present("ADMIN_PANEL_SECRET") }
  };
}

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
}

export async function testIntegration(provider) {
  const start = Date.now();
  try {
    if (provider === "supabase") {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
      const response = await fetchWithTimeout(`${url.replace(/\/$/, "")}/rest/v1/radar_state?id=eq.1&select=id`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } });
      if (!response.ok) throw new Error(response.status === 404 ? "Tabela radar_state não encontrada. Execute supabase-setup.sql." : `Supabase respondeu HTTP ${response.status}. Confira URL, chave e permissões.`);
      return { provider, ok: true, message: "Supabase respondeu e a tabela radar_state está acessível.", elapsedMs: Date.now() - start };
    }
    if (provider === "cloudflare") {
      const token = process.env.CLOUDFLARE_API_TOKEN;
      const account = process.env.CLOUDFLARE_ACCOUNT_ID;
      if (!token || !account) throw new Error("Configure CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID.");
      const response = await fetchWithTimeout(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error("Cloudflare recusou a verificação. Confira o Account ID, o token e as permissões da conta.");
      return { provider, ok: true, message: "Cloudflare autenticou a conta. Isso não confirma ainda uma publicação Pages.", elapsedMs: Date.now() - start };
    }
    if (provider === "mercadopago") {
      const token = process.env.MP_ACCESS_TOKEN;
      if (!token) throw new Error("Configure MP_ACCESS_TOKEN.");
      const response = await fetchWithTimeout("https://api.mercadopago.com/users/me", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (!response.ok) throw new Error("Mercado Pago recusou a verificação. Confira o token e se ele pertence ao ambiente correto.");
      return { provider, ok: true, message: "Token Mercado Pago aceito. Isso não confirma o fluxo completo de checkout/webhook.", elapsedMs: Date.now() - start };
    }
    if (provider === "openrouter") {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("Configure OPENROUTER_API_KEY.");
      const model = process.env.OPENROUTER_MODEL || "openrouter/free";
      const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Radar de Clientes" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Responda apenas: conexão OK" }], max_tokens: 20 })
      }, 30000);
      if (!response.ok) throw new Error(response.status === 429 ? "OpenRouter atingiu limite temporário ou de créditos." : `OpenRouter respondeu HTTP ${response.status}. Confira a chave e o modelo configurado.`);
      const data = await response.json();
      if (!data?.choices?.[0]?.message?.content) throw new Error("OpenRouter não retornou texto utilizável.");
      return { provider, ok: true, message: "OpenRouter respondeu a uma solicitação de teste.", model: data.model || model, elapsedMs: Date.now() - start };
    }
    throw new Error("Sistema desconhecido. Use supabase, openrouter, cloudflare ou mercadopago.");
  } catch (error) {
    return { provider, ok: false, message: error?.message || "Falha no teste.", elapsedMs: Date.now() - start };
  }
}
