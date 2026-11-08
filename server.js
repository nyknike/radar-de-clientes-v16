import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
// Compatibilidade de implantação: aceita o módulo organizado em config/ e também
// o formato antigo em que integrations.js ficou acidentalmente na raiz do GitHub.
let integrationModule;
try {
  integrationModule = await import("./config/integrations.js");
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  try {
    integrationModule = await import("./integrations.js");
  } catch {
    throw new Error("Módulo de integrações ausente. Esperado config/integrations.js ou integrations.js na raiz.");
  }
}
const { getIntegrationStatus, testIntegration } = integrationModule;
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = process.cwd();
app.use(express.json({limit:"25mb"}));
app.use((req,res,next)=>{ if(req.path==="/"||req.path==="/index.html"||(req.path.startsWith("/demo/")||req.path.startsWith("/site/"))||req.path.endsWith(".js")||req.path.endsWith(".css")){res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");res.setHeader("Pragma","no-cache");res.setHeader("Expires","0");} next(); });

// V18.0.0: o banco remoto é obrigatório em produção. O arquivo local é apenas
// fallback de desenvolvimento; o disco efêmero do Render não é armazenamento durável.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "radar-state.json");
const isProduction = process.env.NODE_ENV === "production";
let state = { sales: [], platforms: [], events: [], publishedSites: [], reservations: [], orders: [], clientData: {} };
const storage = { configured: false, connected: false, error: null, checkedAt: null, host: null, failureCode: null, failureHint: null };
let lastRemoteAttemptAt = 0;

function getErrorCode(error) {
  let current = error;
  for (let i = 0; current && i < 5; i++, current = current.cause) {
    if (current.code) return String(current.code);
  }
  return error?.name === "TimeoutError" ? "ETIMEDOUT" : null;
}
function supabaseFailureHint(code, message = "") {
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Falha de DNS ao localizar o host do Supabase. Confira se SUPABASE_URL contém o domínio correto do projeto.";
  if (["ECONNRESET", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) return "A conexão de rede com o Supabase foi interrompida ou recusada. Verifique disponibilidade do projeto e rede.";
  if (code === "ETIMEDOUT" || /timeout/i.test(message)) return "A conexão com o Supabase excedeu o tempo limite.";
  if (code === "ERR_INVALID_URL" || /Invalid URL/i.test(message)) return "SUPABASE_URL não é uma URL válida. Use a URL HTTPS do projeto, sem espaços ou caminhos extras.";
  if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "ERR_TLS_CERT_ALTNAME_INVALID") return "Falha na validação TLS/certificado ao conectar ao Supabase.";
  return "Falha de transporte ao conectar ao Supabase. Consulte o código técnico e o host informados no diagnóstico.";
}
function describeSupabaseError(error, url) {
  const code = getErrorCode(error);
  const host = (() => { try { return new URL(url).hostname; } catch { return null; } })();
  const message = String(error?.message || "Falha desconhecida").slice(0, 180);
  return { message: code ? `${message} (${code})` : message, code, host, hint: supabaseFailureHint(code, message) };
}
async function supabaseFetch(url, options = {}) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  } catch (fetchError) {
    // Fallback com https.request nativo para contornar falhas específicas do transporte Undici/fetch.
    try {
      const target = new URL(url);
      if (target.protocol !== "https:") throw new Error("SUPABASE_URL precisa usar HTTPS.");
      const result = await new Promise((resolve, reject) => {
        const req = https.request(target, { method: options.method || "GET", headers: options.headers || {}, timeout: 10000 }, response => {
          const chunks = [];
          response.on("data", chunk => chunks.push(chunk));
          response.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, text: async () => body, json: async () => JSON.parse(body || "null") });
          });
        });
        req.on("timeout", () => req.destroy(Object.assign(new Error("Supabase request timed out"), { code: "ETIMEDOUT" })));
        req.on("error", reject);
        if (options.body) req.write(options.body);
        req.end();
      });
      console.warn("Supabase: fallback HTTPS nativo concluiu a requisição após falha do fetch.");
      return result;
    } catch (fallbackError) {
      const primaryCode = getErrorCode(fetchError);
      const fallbackCode = getErrorCode(fallbackError);
      const combined = new Error(`fetch failed; fallback HTTPS também falhou${fallbackCode ? ` (${fallbackCode})` : ""}${primaryCode ? `; fetch: ${primaryCode}` : ""}`);
      combined.code = fallbackCode || primaryCode;
      combined.cause = fallbackError;
      throw combined;
    }
  }
}
function normalizeState(x={}) {
  return {
    sales: Array.isArray(x.sales) ? x.sales : [],
    platforms: Array.isArray(x.platforms) ? x.platforms : [],
    events: Array.isArray(x.events) ? x.events : [],
    publishedSites: Array.isArray(x.publishedSites) ? x.publishedSites : [],
    reservations: Array.isArray(x.reservations) ? x.reservations : [],
    orders: Array.isArray(x.orders) ? x.orders : [],
    clientData: x.clientData && typeof x.clientData === "object" && !Array.isArray(x.clientData) ? x.clientData : {}
  };
}
function loadState(){
  try {
    fs.mkdirSync(DATA_DIR,{recursive:true});
    if(fs.existsSync(STATE_FILE)) state=normalizeState(JSON.parse(fs.readFileSync(STATE_FILE,"utf8")));
  } catch(err) { console.error("Não foi possível carregar o estado local:",err.message); }
}
async function loadRemoteState(){
  const url=String(process.env.SUPABASE_URL||"").trim(), key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
  storage.configured=!!(url&&key);
  storage.checkedAt=new Date().toISOString();
  storage.host = (() => { try { return new URL(url).hostname; } catch { return null; } })();
  lastRemoteAttemptAt = Date.now();
  if(!url||!key){
    storage.connected=false;
    storage.error="Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no serviço Web do Render.";
    storage.failureCode="MISSING_ENV";
    storage.failureHint="Uma ou ambas as variáveis do Supabase estão ausentes ou vazias.";
    return false;
  }
  try{
    const parsedUrl=new URL(url);
    if(parsedUrl.protocol!=="https:") throw Object.assign(new Error("SUPABASE_URL precisa usar HTTPS."),{code:"ERR_INVALID_URL"});
    const r=await supabaseFetch(`${url.replace(/\/$/,"")}/rest/v1/radar_state?id=eq.1&select=state`,{
      headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"}
    });
    if(!r.ok) throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0,240)}`);
    const rows=await r.json();
    state=normalizeState(rows[0]?.state || {});
    storage.connected=true; storage.error=null; storage.failureCode=null; storage.failureHint=null;
    return true;
  }catch(err){
    const detail=describeSupabaseError(err,url);
    storage.connected=false;
    storage.error=detail.message; storage.failureCode=detail.code; storage.failureHint=detail.hint; storage.host=detail.host;
    console.error("Falha ao conectar ao Supabase:",JSON.stringify({host:detail.host,code:detail.code,message:detail.message,hint:detail.hint}));
    return false;
  }
}
async function persistState(){
  const url=String(process.env.SUPABASE_URL||"").trim(), key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
  if(url&&key){
    try{
      const r=await supabaseFetch(`${url.replace(/\/$/,"")}/rest/v1/radar_state?on_conflict=id`,{
        method:"POST",
        headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify({id:1,state,updated_at:new Date().toISOString()})
      });
      if(!r.ok) throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0,240)}`);
      storage.connected=true; storage.error=null; storage.failureCode=null; storage.failureHint=null; storage.checkedAt=new Date().toISOString();
      return true;
    }catch(err){ const detail=describeSupabaseError(err,url); storage.connected=false; storage.error=detail.message; storage.failureCode=detail.code; storage.failureHint=detail.hint; storage.host=detail.host; console.error("Falha ao salvar Supabase:",JSON.stringify({host:detail.host,code:detail.code,message:detail.message,hint:detail.hint})); return false; }
  }
  if(isProduction){ storage.connected=false; storage.error="Banco persistente não configurado em produção."; return false; }
  try { fs.mkdirSync(DATA_DIR,{recursive:true}); const tmp=STATE_FILE+".tmp"; fs.writeFileSync(tmp,JSON.stringify(state,null,2)); fs.renameSync(tmp,STATE_FILE); return true; }
  catch(err){ console.error("Não foi possível salvar o estado local:",err.message); return false; }
}
if(isProduction){ /* nunca carregar um arquivo efêmero como se fosse banco persistente */ }
else { loadState(); storage.connected=true; storage.error=null; }
const stateReady = isProduction ? loadRemoteState() : Promise.resolve(true);
async function requireStorage(res){
  await stateReady;
  if(isProduction && !storage.connected && Date.now()-lastRemoteAttemptAt>20000) await loadRemoteState();
  if(isProduction && !storage.connected){
    res.status(503).json({ok:false,error:"Armazenamento persistente indisponível. Configure/verifique o Supabase antes de publicar ou salvar sites.",storage:{configured:storage.configured,connected:false,detail:storage.error}});
    return false;
  }
  return true;
}

const integrationStatus = getIntegrationStatus();
const cfg = {
  payment: integrationStatus.mercadopago.configured ? "mercadopago-configured" : "manual",
  hosting: integrationStatus.cloudflare.configured ? "cloudflare-configured" : "manual",
  domain: process.env.DOMAIN_PROVIDER || "manual",
  ai: integrationStatus.openrouter.configured ? "openrouter-configured" : "not-configured"
};

// V21.5.3: editor visual ampliado; IA pode editar cores globais, fundos, tipografia, densidade e formatos.
// A chave permanece no servidor; o modelo só pode devolver dados estruturados permitidos.
const openRouterEditRequests = new Map();
app.post("/api/ai/site-edit", adminAuth, async (req, res) => {
  const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
  const project = req.body?.project && typeof req.body.project === "object" ? req.body.project : {};
  if (!instruction || instruction.length > 2500) return res.status(400).json({ ok:false, error:"Descreva a alteração em até 2500 caracteres." });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(503).json({ ok:false, error:"OPENROUTER_API_KEY não está configurada no Render." });
  const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
  const now = Date.now();
  const recent = (openRouterEditRequests.get(ip) || []).filter(t => now - t < 60000);
  if (recent.length >= 5) return res.status(429).json({ ok:false, error:"Limite de 5 edições com IA por minuto. Aguarde e tente novamente." });
  recent.push(now); openRouterEditRequests.set(ip, recent);
  const safeProject = {
    name: String(project.name || "").slice(0,120), type: String(project.type || "other").slice(0,50),
    title: String(project.title || "").slice(0,180), description: String(project.description || "").slice(0,1200),
    c1: String(project.c1 || ""), c2: String(project.c2 || ""), font: String(project.font || ""),
    backgroundColor: String(project.backgroundColor || ""), textColor: String(project.textColor || ""),
    surfaceColor: String(project.surfaceColor || ""), headingSize: Number(project.headingSize) || 64,
    bodySize: Number(project.bodySize) || 16, density: String(project.density || "comfortable"),
    dark: Boolean(project.dark), btn: String(project.btn || "round"), imageShape: String(project.imageShape || "round"),
    visualStyle: String(project.visualStyle || ""), layoutVariant: String(project.layoutVariant || ""),
    items: Array.isArray(project.items) ? project.items.slice(0,15).map(x => ({cat:String(x?.cat||"").slice(0,80),name:String(x?.name||"").slice(0,120),price:String(x?.price||"").slice(0,50),desc:String(x?.desc||"").slice(0,300),img:String(x?.img||"").slice(0,2000)})) : []
  };
  const configuredModel = String(process.env.OPENROUTER_MODEL || "openrouter/free").trim();
  const models = [...new Set([configuredModel, "openrouter/free"].filter(Boolean))];
  try {
    let data = null, lastStatus = 0, lastMessage = "";
    for (const model of models) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:"POST", headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","X-OpenRouter-Title":"Radar de Clientes"},
        body:JSON.stringify({model,temperature:0.25,max_tokens:2200,messages:[
          {role:"system",content:"Você é um designer de interface e redator de sites profissionais para pequenos negócios brasileiros. Responda SOMENTE com JSON válido, sem markdown, HTML ou JavaScript. Esquema: {\"title\":string,\"description\":string,\"c1\":string,\"c2\":string,\"backgroundColor\":string,\"textColor\":string,\"surfaceColor\":string,\"font\":string,\"headingSize\":number,\"bodySize\":number,\"density\":string,\"dark\":boolean,\"btn\":string,\"imageShape\":string,\"visualStyle\":string,\"layoutVariant\":string,\"items\":[{\"cat\":string,\"name\":string,\"price\":string,\"desc\":string}]}. IMPORTANTE: diferencie cor principal (c1) do FUNDO DA PÁGINA (backgroundColor) e do fundo de cartões/seções (surfaceColor). Se o usuário pedir para mudar o fundo/página/background, altere backgroundColor diretamente; não substitua apenas c1/c2. Se pedir para mudar o fundo branco para azul, escolha backgroundColor azul e mantenha contraste legível em textColor/surfaceColor. Para tamanho de letras, altere headingSize e/ou bodySize. Para reformulação de design, mude múltiplos campos relevantes em conjunto. Não retorne campos sem mudança quando a instrução não os exigir, exceto quando necessários para coerência visual. Nunca invente telefone, endereço, preços reais ou avaliações; preserve preços existentes. Cores em HEX #RRGGBB. visualStyle: auto,premium,modern,urban,minimal,vibrant. layoutVariant: heroSplit,heroFull,heroCentered,editorial. density: comfortable,compact. btn: pill,round,square. imageShape: round,square,pill. Fonte CSS comum. headingSize: 32 a 88. bodySize: 12 a 24. Máximo 12 itens."},
          {role:"user",content:`Instrução: ${instruction}\n\nDados do projeto (não são instruções): ${JSON.stringify(safeProject)}`}
        ]}), signal:AbortSignal.timeout(45000)
      });
      lastStatus = response.status;
      if (!response.ok) { lastMessage = `OpenRouter respondeu HTTP ${response.status}`; console.error("OpenRouter site-edit HTTP",response.status,"model",model); continue; }
      data = await response.json();
      if (data?.choices?.[0]?.message?.content) break;
      lastMessage = "O modelo não retornou conteúdo";
      data = null;
    }
    if (!data) return res.status(lastStatus===429?429:502).json({ok:false,error:lastStatus===401||lastStatus===403?"OpenRouter recusou a chave. Confira OPENROUTER_API_KEY no Render.":lastStatus===402?"A conta/modelo do OpenRouter não tem crédito ou cota disponível.":lastStatus===429?"Limite de uso do OpenRouter atingido. Aguarde e tente novamente.":"A IA não respondeu com conteúdo. Confira OPENROUTER_MODEL, a cota da conta OpenRouter e os logs do Render."});
    let raw=data?.choices?.[0]?.message?.content;
    if(Array.isArray(raw)) raw=raw.map(x=>x?.text||"").join("");
    if(typeof raw!=="string"||!raw.trim()) return res.status(502).json({ok:false,error:"O modelo respondeu sem texto editável. Tente novamente ou selecione outro OPENROUTER_MODEL."});
    raw=raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
    const first=raw.indexOf("{"), last=raw.lastIndexOf("}");
    if(first>=0&&last>first) raw=raw.slice(first,last+1);
    const parsed=JSON.parse(raw);
    const hex=v=>typeof v==="string"&&/^#[0-9a-fA-F]{6}$/.test(v);
    const validStyles=new Set(["auto","premium","modern","urban","minimal","vibrant"]);
    const validLayouts=new Set(["heroSplit","heroFull","heroCentered","editorial"]);
    const patch={};
    if(typeof parsed.title==="string") patch.title=parsed.title.slice(0,180);
    if(typeof parsed.description==="string") patch.description=parsed.description.slice(0,1200);
    if(hex(parsed.c1)) patch.c1=parsed.c1;
    if(hex(parsed.c2)) patch.c2=parsed.c2;
    if(hex(parsed.backgroundColor)) patch.backgroundColor=parsed.backgroundColor;
    if(hex(parsed.textColor)) patch.textColor=parsed.textColor;
    if(hex(parsed.surfaceColor)) patch.surfaceColor=parsed.surfaceColor;
    if(typeof parsed.font==="string"&&/^[a-zA-Z ,'-]{1,60}$/.test(parsed.font)) patch.font=parsed.font;
    if(Number.isFinite(Number(parsed.headingSize))&&Number(parsed.headingSize)>=32&&Number(parsed.headingSize)<=88) patch.headingSize=Math.round(Number(parsed.headingSize));
    if(Number.isFinite(Number(parsed.bodySize))&&Number(parsed.bodySize)>=12&&Number(parsed.bodySize)<=24) patch.bodySize=Math.round(Number(parsed.bodySize));
    if(["comfortable","compact"].includes(parsed.density)) patch.density=parsed.density;
    if(typeof parsed.dark==="boolean") patch.dark=parsed.dark;
    if(["pill","round","square"].includes(parsed.btn)) patch.btn=parsed.btn;
    if(["round","square","pill"].includes(parsed.imageShape)) patch.imageShape=parsed.imageShape;
    if(validStyles.has(parsed.visualStyle)) patch.visualStyle=parsed.visualStyle;
    if(validLayouts.has(parsed.layoutVariant)) patch.layoutVariant=parsed.layoutVariant;
    if(Array.isArray(parsed.items)) patch.items=parsed.items.slice(0,12).map((x,i)=>({cat:String(x?.cat||"").slice(0,80),name:String(x?.name||"").slice(0,120),price:String(x?.price||safeProject.items[i]?.price||"").slice(0,50),desc:String(x?.desc||"").slice(0,300),img:safeProject.items[i]?.img||""})).filter(x=>x.name);
    if(!Object.keys(patch).length) return res.status(502).json({ok:false,error:"A IA não retornou campos editáveis reconhecidos. Tente uma instrução mais específica."});
    return res.json({ok:true,model:data.model||configuredModel,patch,message:"Sugestão gerada. Confira a prévia e salve o projeto."});
  } catch(error) {
    console.error("Falha na edição IA:",error?.name||"Error",error?.message||"");
    return res.status(502).json({ok:false,error:error instanceof SyntaxError?"A IA retornou JSON inválido. Tente novamente.":error?.name==="TimeoutError"?"A IA demorou demais para responder. Tente novamente.":"Falha de comunicação com OpenRouter. Confira a conexão e os logs do Render."});
  }
});

// V20.10.0: endpoint seguro para validar a conexão com OpenRouter antes de ligar
// a IA ao fluxo visual. A chave permanece exclusivamente no servidor/Render.
const openRouterRequests = new Map();
app.post("/api/ai/test", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > 3000) {
    return res.status(400).json({ ok: false, error: "Envie um prompt de até 3000 caracteres." });
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: "OPENROUTER_API_KEY não configurada nas variáveis de ambiente do Render." });
  }
  const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
  const now = Date.now();
  const recent = (openRouterRequests.get(ip) || []).filter(t => now - t < 60000);
  if (recent.length >= 5) {
    return res.status(429).json({ ok: false, error: "Limite de 5 testes por minuto atingido. Aguarde e tente novamente." });
  }
  recent.push(now);
  openRouterRequests.set(ip, recent);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Radar de Clientes"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          { role: "system", content: "Você é um assistente de criação de sites e design para pequenos negócios. Responda em português brasileiro, de forma objetiva." },
          { role: "user", content: prompt }
        ],
        max_tokens: 1000
      }),
      signal: AbortSignal.timeout(45000)
    });
    if (!response.ok) {
      const status = response.status;
      console.error("OpenRouter respondeu com HTTP", status);
      return res.status(502).json({ ok: false, error: status === 429 ? "Limite do provedor de IA atingido; tente mais tarde." : "O provedor de IA não concluiu a solicitação. Confira a chave, os limites e a disponibilidade do modelo." });
    }
    const data = await response.json();
    const result = data?.choices?.[0]?.message?.content;
    if (typeof result !== "string" || !result.trim()) {
      return res.status(502).json({ ok: false, error: "O modelo não retornou texto válido." });
    }
    return res.json({ ok: true, model: data.model || "openrouter/free", text: result.trim() });
  } catch (error) {
    console.error("Falha na conexão OpenRouter:", error?.name || "Error");
    return res.status(502).json({ ok: false, error: "Não foi possível conectar ao provedor de IA. Tente novamente." });
  }
});

// V21.5.7: diagnóstico mais claro de falhas do Workers AI; mantém as integrações existentes.
// Usa CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID já configurados no Render.
// Limites locais conservadores para evitar uso acidental excessivo.
const generatedImageRequests = new Map();
const generatedImageDaily = new Map();
app.post("/api/ai/generate-image", adminAuth, async (req,res)=>{
  const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CLOUDFLARE_ACCOUNT_ID;
  if(!token||!account) return res.status(503).json({ok:false,error:"Configure CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID no Render. O token precisa da permissão de conta Workers AI adequada para executar modelos (consulte as permissões da Cloudflare)."});
  const ip=String(req.ip||req.socket?.remoteAddress||"unknown"), now=Date.now();
  const recent=(generatedImageRequests.get(ip)||[]).filter(t=>now-t<60000);
  if(recent.length>=2) return res.status(429).json({ok:false,error:"Limite de 2 gerações por minuto. Aguarde um pouco."});
  const day=new Date().toISOString().slice(0,10), key=`${day}:${ip}`;
  const count=generatedImageDaily.get(key)||0;
  if(count>=12) return res.status(429).json({ok:false,error:"Limite local de 12 imagens por dia atingido. Tente amanhã."});
  const body=req.body||{};
  const type=String(body.type||"generic").slice(0,40), role=String(body.role||"hero").slice(0,30), subject=String(body.subject||"negócio local").replace(/[<>\r\n]/g," ").slice(0,120), productName=String(body.productName||"").replace(/[<>\r\n]/g," ").slice(0,100), productDescription=String(body.productDescription||"").replace(/[<>\r\n]/g," ").slice(0,180), productCategory=String(body.productCategory||"").replace(/[<>\r\n]/g," ").slice(0,80);
  const allowed=new Set(["restaurant","pizza","fast_food","cafe","bakery","barber","salon","pet","shop","market","gym","clinic","hotel","car_repair","generic","other"]);
  const kind=allowed.has(type)?type:"generic";
  const concepts={restaurant:"fotografia gastronômica editorial de um prato brasileiro apetitoso, iluminação lateral profissional",pizza:"fotografia gastronômica premium de pizza artesanal recém-assada, queijo e ingredientes frescos",fast_food:"fotografia publicitária de hambúrguer artesanal com ingredientes frescos e composição apetitosa",cafe:"fotografia editorial de café especial e confeitaria em cafeteria aconchegante",bakery:"fotografia profissional de pães artesanais e doces recém-assados",barber:"fotografia de interiores de barbearia premium, cadeiras profissionais, espelhos e iluminação quente",salon:"fotografia editorial de salão de beleza moderno, interior sofisticado e iluminação natural",pet:"fotografia comercial acolhedora de pet shop moderno com animais felizes e ambiente limpo",shop:"fotografia de campanha de loja contemporânea com vitrine elegante e produtos bem expostos",market:"fotografia comercial de mercado de bairro organizado com frutas e verduras frescas",gym:"fotografia profissional de academia moderna com equipamentos organizados e iluminação dramática",clinic:"fotografia de clínica moderna, recepção limpa, luz natural e ambiente confiável",hotel:"fotografia de hotel boutique sofisticado, quarto elegante, roupa de cama impecável e luz natural",car_repair:"fotografia profissional de oficina automotiva moderna, organizada, limpa e bem iluminada",generic:"fotografia editorial premium para um negócio local, composição comercial profissional"};
  const productMode=role==="product"; const prompt=productMode
    ? `Fotografia comercial de produto para catálogo profissional de ${subject}. Produto exato: ${productName||"produto do estabelecimento"}. Categoria: ${productCategory||kind}. Descrição e características informadas: ${productDescription||"sem detalhes adicionais"}. Mostre um único produto claramente reconhecível, bem iluminado, com textura realista, composição editorial premium, fundo limpo e apropriado ao produto, enquadramento quadrado para card de catálogo, alta qualidade fotográfica. Não incluir texto, preço, letras, logotipo, embalagem com marca inventada, marca d'água, colagem ou interface de site. Não inventar elementos de marca específicos.`
    : `${concepts[kind]||concepts.generic}. ${role==="gallery"?"Imagem complementar de ambiente ou detalhe, enquadramento diferente da imagem principal.":"Imagem principal horizontal de destaque para o site, composição cinematográfica ampla."} Contexto do negócio: ${subject}. Fotografia realista de alta qualidade, direção de arte profissional, textura natural, contraste equilibrado, profundidade, sem texto, sem letras, sem logotipos, sem marca d'água, sem colagem, sem interface de site.`;
  try{
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/@cf/black-forest-labs/flux-1-schnell`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({prompt,steps:4}),signal:AbortSignal.timeout(90000)});
    const ct=response.headers.get("content-type")||"";
    if(!response.ok){
      const raw=(await response.text()).slice(0,3000);
      let cfData=null;try{cfData=JSON.parse(raw)}catch{}
      const cfErrors=Array.isArray(cfData?.errors)?cfData.errors:[];
      const details=cfErrors.map(e=>[e?.code,e?.message].filter(Boolean).join(": ")).filter(Boolean).join("; ").replace(/[\r\n<>]/g," ").slice(0,500);
      console.error("Cloudflare image generation HTTP",response.status,"codes",cfErrors.map(e=>e?.code).filter(Boolean).join(",")||"none");
      let message;
      if(response.status===401||response.status===403) message="Cloudflare recusou a chamada (HTTP "+response.status+"). Confirme se o Render usa o token atualizado, se CLOUDFLARE_ACCOUNT_ID pertence à mesma conta e se o token tem Account > Workers AI > Read. "+(details?"Detalhe da Cloudflare: "+details:"A resposta não trouxe detalhes adicionais.");
      else if(response.status===429) message="Limite de geração da Cloudflare atingido (HTTP 429). Tente novamente mais tarde. "+(details?"Detalhe: "+details:"");
      else if(response.status===404) message="A Cloudflare não encontrou o endpoint ou modelo solicitado (HTTP 404). O modelo configurado é @cf/black-forest-labs/flux-1-schnell. "+(details?"Detalhe: "+details:"");
      else message="A Cloudflare não conseguiu gerar a imagem (HTTP "+response.status+"). "+(details?"Detalhe da Cloudflare: "+details:"Confira a conta, o modelo e os limites disponíveis.");
      return res.status(response.status===429?429:502).json({ok:false,error:message});
    }
    let image="", data;
    if(ct.includes("application/json")){data=await response.json();image=data?.result?.image||data?.image||"";}
    else {const buf=Buffer.from(await response.arrayBuffer());image=buf.toString("base64");}
    if(typeof image!=="string"||!image) return res.status(502).json({ok:false,error:"O modelo respondeu sem uma imagem utilizável."});
    recent.push(now);generatedImageRequests.set(ip,recent);generatedImageDaily.set(key,count+1);
    return res.json({ok:true,dataUrl:`data:image/jpeg;base64,${image}`,model:"@cf/black-forest-labs/flux-1-schnell",remainingToday:11-count});
  }catch(error){console.error("Falha na geração de imagem Cloudflare:",error?.name||"Error",error?.message||"");return res.status(502).json({ok:false,error:error?.name==="TimeoutError"?"A geração demorou demais. Tente novamente.":"Não foi possível conectar ao gerador de imagens Cloudflare."});}
});

app.get("/api/health", async (_req,res)=>{
  await stateReady;
  if(isProduction && !storage.connected && Date.now()-lastRemoteAttemptAt>20000) await loadRemoteState();
  res.status(200).json({ok:true,version:"V21.8.0",persistentStorage:storage.connected,storage:{configured:storage.configured,connected:storage.connected,error:storage.connected?null:storage.error,host:storage.host,failureCode:storage.failureCode,failureHint:storage.failureHint,checkedAt:storage.checkedAt},integrations:cfg});
});

// Status público mostra apenas se variáveis existem; nunca devolve valores secretos.
app.get("/api/integrations/status", (_req,res)=>{
  res.setHeader("Cache-Control", "no-store");
  res.json({ok:true,version:"V21.8.0",integrations:getIntegrationStatus()});
});

// O servidor é a fonte compartilhada dos dados entre dispositivos.
app.get("/api/state", adminAuth, async (_req,res)=>{if(!await requireStorage(res)) return;res.setHeader("Cache-Control","no-store");res.json({ok:true,state});});
app.put("/api/state", adminAuth, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const body=req.body||{};
  if(body.sales!==undefined){ if(!Array.isArray(body.sales)) return res.status(400).json({ok:false,error:"sales precisa ser uma lista."}); state.sales=body.sales; }
  if(body.platforms!==undefined){ if(!Array.isArray(body.platforms)) return res.status(400).json({ok:false,error:"platforms precisa ser uma lista."}); state.platforms=body.platforms; }
  if(body.clientData!==undefined){
    if(!body.clientData || typeof body.clientData !== "object" || Array.isArray(body.clientData)) return res.status(400).json({ok:false,error:"clientData precisa ser um objeto."});
    const bytes=Buffer.byteLength(JSON.stringify(body.clientData),"utf8");
    if(bytes>12*1024*1024) return res.status(413).json({ok:false,error:"Os dados auxiliares ultrapassam 12 MB. Reduza arquivos/imagens armazenados no navegador."});
    state.clientData={...(state.clientData||{}),...body.clientData};
  }
  if(!await persistState()) return res.status(500).json({ok:false,error:"Não foi possível persistir os dados no servidor. Confira a configuração do banco ou disco."});
  res.json({ok:true,savedAt:new Date().toISOString()});
});
app.get("/api/demo/:id", adminAuth, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const code=String(req.params.id);
  const sale=state.sales.find(x=>String(x.id)===code||String(x.id).replace(/-/g,"").startsWith(code));
  if(!sale) return res.status(404).json({ok:false,error:"Demonstração não encontrada."});
  const platform=state.platforms.find(x=>String(x.id)===String(sale.platformId||sale.businessId))||state.platforms.find(x=>String(x.name)===String(sale.name));
  res.json({ok:true,sale,platform:platform||null,events:state.events.filter(x=>String(x.saleId)===String(sale.id))});
});

app.get("/api/site/:id", async (req,res)=>{
  if(!await requireStorage(res)) return;
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  const id=String(req.params.id||"").trim();
  if(!id) return res.status(400).json({ok:false,error:"ID do site obrigatório."});
  // Primeiro resolvemos o ID do próprio projeto publicado. Se houver uma venda
  // vinculada, devolvemos a venda também para preservar a barra de aprovação.
  const published=state.publishedSites.find(x=>String(x.id)===id);
  if(published?.platform){
    const sale=state.sales.find(x=>String(x.platformId||x.businessId)===id||String(x.businessId)===id)||null;
    return res.json({ok:true,kind:sale?"demo":"published",platform:published.platform,sale:sale?{id:sale.id,name:sale.name,stage:sale.stage,demoViewedAt:sale.demoViewedAt||null,approvedAt:sale.approvedAt||null}:null});
  }
  // Compatibilidade com links antigos que usavam o ID da venda.
  const sale=state.sales.find(x=>String(x.id)===id);
  if(sale){
    const platform=state.publishedSites.find(x=>String(x.id)===String(sale.platformId||sale.businessId))?.platform
      ||state.platforms.find(x=>String(x.id)===String(sale.platformId||sale.businessId));
    if(!platform) return res.status(404).json({ok:false,error:"A demonstração existe, mas o projeto do site não foi encontrado no servidor."});
    return res.json({ok:true,kind:"demo",platform,sale:{id:sale.id,name:sale.name,stage:sale.stage,demoViewedAt:sale.demoViewedAt||null,approvedAt:sale.approvedAt||null}});
  }
  const platform=state.platforms.find(x=>String(x.id)===id);
  if(!platform) return res.status(404).json({ok:false,error:"Site não encontrado no armazenamento público do servidor."});
  res.json({ok:true,kind:"published",platform,sale:null});
});

app.put("/api/public-sites/:id", adminAuth, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const id=String(req.params.id||"").trim(), platform=req.body?.platform;
  const html=typeof req.body?.html==="string"?req.body.html:null;
  if(!id||id.length>120||!platform||String(platform.id)!==id) return res.status(400).json({ok:false,error:"Dados do site público inválidos."});
  if(html && (!/^\s*<!doctype html/i.test(html) || html.length>4*1024*1024)) return res.status(413).json({ok:false,error:"O HTML do site precisa ser completo e ter até 4 MB. Reduza imagens muito grandes e tente novamente."});
  const previous=state.publishedSites.find(x=>String(x.id)===id);
  const item={...(previous||{}),id,platform,updatedAt:new Date().toISOString()};
  if(html) item.html=html;
  const i=state.publishedSites.findIndex(x=>String(x.id)===id);
  if(i<0) state.publishedSites.push(item); else state.publishedSites[i]=item;
  const pi=state.platforms.findIndex(x=>String(x.id)===id);
  if(pi<0) state.platforms.push(platform); else state.platforms[pi]=platform;
  if(!await persistState()) return res.status(500).json({ok:false,error:"Não foi possível salvar o site público no servidor."});
  res.json({ok:true,id,updatedAt:item.updatedAt,htmlStored:!!item.html});
});

app.get("/api/public-status", async (_req,res)=>{
  if(!await requireStorage(res)) return;
  res.json({ok:true,version:"V21.8.0",persistentStorage:storage.connected,sales:state.sales.length,platforms:state.platforms.length,publishedSites:state.publishedSites.length});
});

app.post("/api/demo/:id/event", async (req,res)=>{
  if(!await requireStorage(res)) return;
  const code=String(req.params.id);
  const sale=state.sales.find(x=>String(x.id)===code||String(x.id).replace(/-/g,"").startsWith(code));
  if(!sale) return res.status(404).json({ok:false,error:"Demonstração não encontrada."});
  const event=String(req.body?.event||"");
  if(!["viewed","approved"].includes(event)) return res.status(400).json({ok:false,error:"Evento inválido."});
  state.events.push({id:crypto.randomUUID(),saleId:sale.id,event,at:new Date().toISOString()});
  if(event==="viewed") { sale.demoViewedAt=sale.demoViewedAt||new Date().toISOString(); if(["demo","preview"].includes(sale.stage)) sale.stage="preview"; }
  if(event==="approved") { sale.approvedAt=new Date().toISOString(); sale.stage="approved"; sale.approvalSource="public-demo"; }
  sale.updatedAt=new Date().toISOString();
  if(!await persistState()) return res.status(500).json({ok:false,error:"Não foi possível registrar o evento no armazenamento persistente."});
  res.json({ok:true,event,sale:{id:sale.id,name:sale.name,stage:sale.stage,demoViewedAt:sale.demoViewedAt||null,approvedAt:sale.approvedAt||null,updatedAt:sale.updatedAt}});
});


// V21.7.0: sessão administrativa assinada no servidor; o segredo nunca fica no JS.
const ADMIN_SESSION_COOKIE="radar_admin_session";
const ADMIN_SESSION_TTL=12*60*60*1000;
function signAdminSession(exp,nonce){
  const secret=process.env.ADMIN_PANEL_SECRET||"";
  const payload=`${exp}.${nonce}`;
  const sig=crypto.createHmac("sha256",secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function validAdminSession(req){
  const expected=process.env.ADMIN_PANEL_SECRET;if(!expected)return false;
  const cookies=String(req.headers.cookie||"").split(";").map(x=>x.trim());
  const raw=cookies.find(x=>x.startsWith(ADMIN_SESSION_COOKIE+"="))?.slice(ADMIN_SESSION_COOKIE.length+1);
  if(!raw)return false;
  let decoded;try{decoded=decodeURIComponent(raw)}catch{return false}
  const [expText,nonce,sig,...extra]=decoded.split(".");
  if(extra.length||!/^\d+$/.test(expText||"")||!nonce||!sig||Number(expText)<Date.now())return false;
  const expectedSig=signAdminSession(expText,nonce).split(".").at(-1);
  const a=Buffer.from(sig),b=Buffer.from(expectedSig);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
app.post("/api/admin/session",(req,res)=>{
  const expected=process.env.ADMIN_PANEL_SECRET;
  if(!expected)return res.status(503).json({ok:false,error:"Configure ADMIN_PANEL_SECRET no Render."});
  const supplied=String(req.body?.secret||"");
  const a=Buffer.from(supplied),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({ok:false,error:"Senha administrativa incorreta."});
  const exp=Date.now()+ADMIN_SESSION_TTL,nonce=crypto.randomBytes(18).toString("base64url");
  const value=signAdminSession(exp,nonce);
  res.setHeader("Set-Cookie",`${ADMIN_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ADMIN_SESSION_TTL/1000)}${isProduction?"; Secure":""}`);
  res.setHeader("Cache-Control","no-store");res.json({ok:true,expiresAt:new Date(exp).toISOString()});
});
app.delete("/api/admin/session",(req,res)=>{res.setHeader("Set-Cookie",`${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction?"; Secure":""}`);res.json({ok:true});});

// V20.10.0: entrada de reservas/pedidos e endpoints privados para o painel do estabelecimento.
// Defina ADMIN_PANEL_SECRET no Render. Não use o mesmo segredo em código público.
const intakeLimits = new Map();
function limitIntake(req,res,next){
  const key=String(req.ip||req.socket?.remoteAddress||"unknown");
  const now=Date.now(), old=intakeLimits.get(key)||[];
  const recent=old.filter(t=>now-t<60000);
  if(recent.length>=12) return res.status(429).json({ok:false,error:"Muitas solicitações em pouco tempo. Aguarde um minuto."});
  recent.push(now); intakeLimits.set(key,recent); next();
}
function cleanText(v,max=500){return String(v??"").replace(/[<>\u0000-\u001f]/g,"").trim().slice(0,max)}
function adminAuth(req,res,next){
  const expected=process.env.ADMIN_PANEL_SECRET;
  if(!expected) return res.status(503).json({ok:false,error:"Painel administrativo ainda não configurado. Defina ADMIN_PANEL_SECRET no Render."});
  if(validAdminSession(req)){res.setHeader("Cache-Control","no-store");return next();}
  // Compatibilidade temporária com clientes antigos V21.6.0.
  const supplied=String(req.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const a=Buffer.from(supplied), b=Buffer.from(expected);
  if(a.length===b.length&&crypto.timingSafeEqual(a,b)) return next();
  return res.status(401).json({ok:false,error:"Sessão administrativa ausente ou expirada. Entre novamente uma vez para liberar o painel."});
}

// Testes reais de conexão ficam protegidos por ADMIN_PANEL_SECRET.
// POST /api/integrations/test com Authorization: Bearer <segredo> e {"providers":["supabase"]}.
app.post("/api/integrations/test", adminAuth, async (req,res)=>{
  const allowed = new Set(["supabase","openrouter","cloudflare","mercadopago"]);
  const requested = Array.isArray(req.body?.providers) ? req.body.providers : [];
  const providers = [...new Set(requested.map(x=>String(x).toLowerCase()))].filter(x=>allowed.has(x));
  if(!providers.length) return res.status(400).json({ok:false,error:"Informe providers: supabase, openrouter, cloudflare e/ou mercadopago."});
  const results = await Promise.all(providers.map(testIntegration));
  res.setHeader("Cache-Control", "no-store");
  res.status(results.every(x=>x.ok)?200:207).json({ok:results.every(x=>x.ok),results});
});
app.post("/api/intake/reservations", limitIntake, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const b=req.body||{};
  const siteId=cleanText(b.siteId,120), name=cleanText(b.name,120), contact=cleanText(b.contact,120), date=cleanText(b.date,10), time=cleanText(b.time,10);
  const mode=String(b.mode||b.bookingMode||"capacity");
  const people=Math.max(1,Math.min(30,Number(b.people)||1));
  const tableId=b.tableId?cleanText(b.tableId,120):null;
  if(!siteId||!name||!contact||!date||!time) return res.status(400).json({ok:false,error:"Informe estabelecimento, nome, contato, data e horário."});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ok:false,error:"Data ou horário inválido."});
  if(!["capacity","tables"].includes(mode)) return res.status(400).json({ok:false,error:"Modo de reserva inválido."});
  const site=state.publishedSites.find(x=>String(x.id)===siteId);
  if(!site) return res.status(404).json({ok:false,error:"Estabelecimento não encontrado."});
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(url&&key){
    try{
      const rpc=await fetch(`${url.replace(/\/$/,"")}/rest/v1/rpc/radar_create_reservation`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({p_site_id:siteId,p_customer_name:name,p_contact:contact,p_email:cleanText(b.email,180),p_slot_date:date,p_slot_time:time,p_people:people,p_mode:mode,p_table_id:tableId,p_notes:cleanText(b.notes,1000),p_dietary_restrictions:cleanText(b.dietaryRestrictions,500)}),signal:AbortSignal.timeout(12000)});
      const result=await rpc.json().catch(()=>({}));
      if(!rpc.ok) throw new Error(result.message||`Supabase RPC HTTP ${rpc.status}`);
      if(!result.ok) return res.status(409).json({ok:false,error:result.error||"Horário indisponível."});
      const item=result.reservation;
      state.reservations=state.reservations.filter(x=>String(x.id)!==String(item.id));
      state.reservations.push(item);
      await persistState();
      return res.status(201).json({ok:true,id:item.id,status:"confirmed",reservation:item,message:"Reserva confirmada! Guarde o código e o token de cancelamento."});
    }catch(err){console.error("Falha na reserva transacional:",err.message);return res.status(503).json({ok:false,error:"Não foi possível confirmar a reserva com segurança. Nenhuma confirmação foi emitida. Tente novamente mais tarde."});}
  }
  if(isProduction) return res.status(503).json({ok:false,error:"A confirmação segura exige SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e a migração V20.10.0."});
  return res.status(503).json({ok:false,error:"A confirmação instantânea exige banco Supabase com a migração V20.10.0 aplicada. Reservas locais não são confirmadas."});
});
app.post("/api/intake/orders", limitIntake, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const b=req.body||{}, siteId=cleanText(b.siteId,120), name=cleanText(b.name,120), contact=cleanText(b.contact,120);
  if(!siteId||!name||!contact||!Array.isArray(b.items)||!b.items.length||b.items.length>80) return res.status(400).json({ok:false,error:"Dados do pedido incompletos."});
  const site=state.publishedSites.find(x=>String(x.id)===siteId);
  if(!site) return res.status(404).json({ok:false,error:"Estabelecimento não encontrado."});
  const items=b.items.slice(0,80).map(x=>({name:cleanText(x.name,160),quantity:Math.max(1,Math.min(99,Number(x.quantity)||1)),unitPrice:Math.max(0,Math.min(100000,Number(x.unitPrice)||0)),options:cleanText(x.options,500)}));
  const total=items.reduce((sum,x)=>sum+x.quantity*x.unitPrice,0);
  const item={id:crypto.randomUUID(),siteId,name,contact,items,total:Math.round(total*100)/100,notes:cleanText(b.notes,1000),status:"received",createdAt:new Date().toISOString()};
  state.orders.push(item);
  if(!await persistState()) return res.status(500).json({ok:false,error:"Não foi possível salvar o pedido. Tente novamente."});
  res.status(201).json({ok:true,id:item.id,status:item.status,total:item.total});
});
// V20.10.0 FASE 2: configuração administrativa de horários e mesas.
async function supabaseAdminRequest(path, method="GET", body=null){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Render.");
  const response=await fetch(`${url.replace(/\/$/,"")}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:method==="POST"?(path.includes("on_conflict")?"resolution=merge-duplicates,return=representation":"return=representation"):"return=representation"},body:body===null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>[]);
  if(!response.ok) throw new Error(data.message||data.error||`Supabase HTTP ${response.status}`);
  return data;
}
// V20.10.0 FASE 3: disponibilidade pública sem expor dados pessoais.
app.get("/api/public/booking-availability", async (req,res)=>{
  if(!await requireStorage(res)) return;
  const siteId=cleanText(req.query.siteId,120), date=cleanText(req.query.date,10), people=Math.max(1,Math.min(30,Number(req.query.people)||1));
  if(!siteId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return res.status(400).json({ok:false,error:"Informe o estabelecimento e uma data válida."});
  if(date < new Date().toISOString().slice(0,10)) return res.json({ok:true,slots:[]});
  if(!state.publishedSites.some(x=>String(x.id)===siteId)) return res.status(404).json({ok:false,error:"Estabelecimento não encontrado."});
  try{
    const [slots,reservations,tables]=await Promise.all([
      supabaseAdminRequest(`radar_booking_slots?site_id=eq.${encodeURIComponent(siteId)}&slot_date=eq.${encodeURIComponent(date)}&active=eq.true&select=id,slot_date,slot_time,mode,capacity&order=slot_time.asc`),
      supabaseAdminRequest(`radar_reservations?site_id=eq.${encodeURIComponent(siteId)}&slot_date=eq.${encodeURIComponent(date)}&status=eq.confirmed&select=slot_time,people,mode,table_id`),
      supabaseAdminRequest(`radar_booking_tables?site_id=eq.${encodeURIComponent(siteId)}&active=eq.true&select=id,label,seats&order=label.asc`)
    ]);
    const result=slots.map(slot=>{
      const time=String(slot.slot_time).slice(0,5), booked=reservations.filter(r=>String(r.slot_time).slice(0,5)===time);
      if(slot.mode==='capacity'){
        const used=booked.reduce((n,r)=>n+Number(r.people||0),0), remaining=Math.max(0,Number(slot.capacity||0)-used);
        return {date,time,mode:'capacity',capacity:Number(slot.capacity||0),remaining,available:remaining>=people,tables:[]};
      }
      const availableTables=tables.filter(t=>Number(t.seats)>=people&&!booked.some(r=>String(r.table_id)===String(t.id))).map(t=>({id:t.id,label:t.label,seats:Number(t.seats)}));
      return {date,time,mode:'tables',capacity:0,remaining:availableTables.length,available:availableTables.length>0,tables:availableTables};
    }).filter(x=>x.available);
    res.setHeader('Cache-Control','no-store'); res.json({ok:true,slots:result});
  }catch(e){console.error('Falha ao consultar disponibilidade:',e.message);res.status(503).json({ok:false,error:'Não foi possível consultar os horários agora. Tente novamente mais tarde.'});}
});
app.post("/api/public/reservations/cancel", limitIntake, async (req,res)=>{
  const id=cleanText(req.body?.id,80), token=cleanText(req.body?.cancellationToken,80);
  if(!id||!token) return res.status(400).json({ok:false,error:'Informe o código e o token de cancelamento.'});
  try{
    const rows=await supabaseAdminRequest(`radar_reservations?id=eq.${encodeURIComponent(id)}&cancellation_token=eq.${encodeURIComponent(token)}&status=eq.confirmed`,'PATCH',{status:'cancelled'});
    if(!rows.length) return res.status(404).json({ok:false,error:'Reserva não encontrada, já cancelada ou código inválido.'});
    res.json({ok:true,message:'Reserva cancelada. O horário foi liberado.'});
  }catch(e){console.error('Falha ao cancelar reserva:',e.message);res.status(503).json({ok:false,error:'Não foi possível cancelar agora. Entre em contato com o estabelecimento.'});}
});
app.get("/api/admin/booking-config", adminAuth, async (req,res)=>{
  const siteId=cleanText(req.query.siteId,120);
  if(!siteId) return res.status(400).json({ok:false,error:"Informe o ID do estabelecimento."});
  try{
    const [slots,tables]=await Promise.all([
      supabaseAdminRequest(`radar_booking_slots?site_id=eq.${encodeURIComponent(siteId)}&select=*&order=slot_date.asc,slot_time.asc`),
      supabaseAdminRequest(`radar_booking_tables?site_id=eq.${encodeURIComponent(siteId)}&select=*&order=label.asc`)
    ]);
    res.json({ok:true,slots,tables});
  }catch(e){res.status(503).json({ok:false,error:e.message});}
});
app.post("/api/admin/booking-slots", adminAuth, async (req,res)=>{
  const b=req.body||{}, siteId=cleanText(b.siteId,120), date=cleanText(b.date,10), time=cleanText(b.time,5), mode=String(b.mode||"capacity"), capacity=Math.max(0,Math.min(500,Number(b.capacity)||0));
  if(!siteId||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||!['capacity','tables'].includes(mode)) return res.status(400).json({ok:false,error:"Preencha estabelecimento, data, horário e modo válidos."});
  if(mode==='capacity'&&capacity<1) return res.status(400).json({ok:false,error:"A capacidade precisa ser maior que zero."});
  try{
    const rows=await supabaseAdminRequest("radar_booking_slots?on_conflict=site_id,slot_date,slot_time","POST",[{site_id:siteId,slot_date:date,slot_time:time,mode,capacity:mode==='capacity'?capacity:0,active:true}]);
    res.status(201).json({ok:true,slot:rows[0]});
  }catch(e){res.status(503).json({ok:false,error:e.message});}
});
app.patch("/api/admin/booking-slots/edit", adminAuth, async (req,res)=>{
  const b=req.body||{}, siteId=cleanText(b.siteId,120), date=cleanText(b.date,10), time=cleanText(b.time,5), mode=String(b.mode||"capacity"), capacity=Math.max(0,Math.min(500,Number(b.capacity)||0));
  if(!siteId||!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!/^[0-2]\\d:[0-5]\\d$/.test(time)||!['capacity','tables'].includes(mode)) return res.status(400).json({ok:false,error:"Dados do horário inválidos."});
  if(mode==='capacity'&&capacity<1) return res.status(400).json({ok:false,error:"A capacidade precisa ser maior que zero."});
  try{
    const rows=await supabaseAdminRequest(`radar_booking_slots?site_id=eq.${encodeURIComponent(siteId)}&slot_date=eq.${encodeURIComponent(date)}&slot_time=eq.${encodeURIComponent(time)}`,"PATCH",[{mode,capacity:mode==='capacity'?capacity:0}]);
    if(!rows.length) return res.status(404).json({ok:false,error:"Horário não encontrado."});
    res.json({ok:true,slot:rows[0]});
  }catch(e){res.status(503).json({ok:false,error:e.message});}
});
app.patch("/api/admin/booking-slots/status", adminAuth, async (req,res)=>{
  const b=req.body||{}, siteId=cleanText(b.siteId,120), date=cleanText(b.date,10), time=cleanText(b.time,5);
  if(!siteId||!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!/^[0-2]\\d:[0-5]\\d$/.test(time)) return res.status(400).json({ok:false,error:"Dados do horário inválidos."});
  try{
    const rows=await supabaseAdminRequest(`radar_booking_slots?site_id=eq.${encodeURIComponent(siteId)}&slot_date=eq.${encodeURIComponent(date)}&slot_time=eq.${encodeURIComponent(time)}`,"PATCH",[{active:Boolean(b.active)}]);
    if(!rows.length) return res.status(404).json({ok:false,error:"Horário não encontrado."});
    res.json({ok:true,slot:rows[0]});
  }catch(e){res.status(503).json({ok:false,error:e.message});}
});
app.post("/api/admin/booking-tables", adminAuth, async (req,res)=>{
  const b=req.body||{}, siteId=cleanText(b.siteId,120), label=cleanText(b.label,80), seats=Math.max(1,Math.min(50,Number(b.seats)||0));
  if(!siteId||!label||!Number.isInteger(seats)||seats<1) return res.status(400).json({ok:false,error:"Informe o nome/número da mesa e sua capacidade."});
  const id=crypto.randomUUID();
  try{
    const rows=await supabaseAdminRequest("radar_booking_tables","POST",[{id,site_id:siteId,label,seats,active:true}]);
    res.status(201).json({ok:true,table:rows[0]});
  }catch(e){res.status(503).json({ok:false,error:e.message});}
});
app.patch("/api/admin/booking-tables/:id", adminAuth, async (req,res)=>{
  const siteId=cleanText(req.body?.siteId,120), active=Boolean(req.body?.active);
  if(!siteId) return res.status(400).json({ok:false,error:"Informe o estabelecimento."});
  try{
    const rows=await supabaseAdminRequest(`radar_booking_tables?id=eq.${encodeURIComponent(req.params.id)}&site_id=eq.${encodeURIComponent(siteId)}`,"PATCH",{active});
    if(!rows.length) return res.status(404).json({ok:false,error:"Mesa não encontrada neste estabelecimento."});
    res.json({ok:true,table:rows[0]});
  }catch(e){res.status(503).json({ok:false,error:e.message});}
});
app.get("/api/admin/inbox", adminAuth, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const siteId=cleanText(req.query.siteId,120);
  if(!siteId) return res.status(400).json({ok:false,error:"Informe o siteId para limitar os dados a um estabelecimento."});
  try{
    const rows=await supabaseAdminRequest(`radar_reservations?site_id=eq.${encodeURIComponent(siteId)}&select=id,site_id,customer_name,contact,email,slot_date,slot_time,people,mode,table_id,notes,dietary_restrictions,status,created_at&order=created_at.desc`);
    const reservations=rows.map(x=>({id:x.id,siteId:x.site_id,name:x.customer_name,contact:x.contact,email:x.email,date:x.slot_date,time:String(x.slot_time).slice(0,5),people:x.people,mode:x.mode,tableId:x.table_id,notes:x.notes,dietaryRestrictions:x.dietary_restrictions,status:x.status,createdAt:x.created_at}));
    res.json({ok:true,reservations,orders:state.orders.filter(x=>x.siteId===siteId)});
  }catch(e){res.status(503).json({ok:false,error:'Não foi possível carregar as reservas do banco: '+e.message});}
});
app.patch("/api/admin/reservations/:id", adminAuth, async (req,res)=>{
  const siteId=cleanText(req.body?.siteId,120), status=String(req.body?.status||"");
  if(!siteId) return res.status(400).json({ok:false,error:"Informe o estabelecimento."});
  if(!["confirmed","cancelled","completed"].includes(status)) return res.status(400).json({ok:false,error:"Estado inválido. Use confirmada, cancelada ou concluída."});
  try{
    const rows=await supabaseAdminRequest(`radar_reservations?id=eq.${encodeURIComponent(req.params.id)}&site_id=eq.${encodeURIComponent(siteId)}&select=id,site_id,customer_name,contact,email,slot_date,slot_time,people,mode,table_id,notes,dietary_restrictions,status,created_at`,'PATCH',{status});
    if(!rows.length) return res.status(404).json({ok:false,error:"Reserva não encontrada neste estabelecimento."});
    const x=rows[0], reservation={id:x.id,siteId:x.site_id,name:x.customer_name,contact:x.contact,email:x.email,date:x.slot_date,time:String(x.slot_time).slice(0,5),people:x.people,mode:x.mode,tableId:x.table_id,notes:x.notes,dietaryRestrictions:x.dietary_restrictions,status:x.status,createdAt:x.created_at};
    state.reservations=state.reservations.filter(v=>String(v.id)!==String(x.id));state.reservations.push(reservation);await persistState();
    res.json({ok:true,reservation});
  }catch(e){res.status(503).json({ok:false,error:'Não foi possível atualizar a reserva: '+e.message});}
});
app.patch("/api/admin/orders/:id", adminAuth, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const item=state.orders.find(x=>x.id===String(req.params.id));
  if(!item) return res.status(404).json({ok:false,error:"Pedido não encontrado."});
  const siteId=cleanText(req.body?.siteId,120);
  if(!siteId||item.siteId!==siteId) return res.status(403).json({ok:false,error:"Este pedido não pertence ao estabelecimento selecionado."});
  const status=String(req.body?.status||"");
  if(!["received","accepted","preparing","ready","completed","cancelled"].includes(status)) return res.status(400).json({ok:false,error:"Estado inválido."});
  item.status=status; item.updatedAt=new Date().toISOString();
  if(!await persistState()) return res.status(500).json({ok:false,error:"Não foi possível salvar a alteração."});
  res.json({ok:true,order:item});
});

app.post("/api/payment/create", async (req,res)=>{
  try{
    const {title="Site profissional",amount,externalReference,notificationUrl}=req.body||{};
    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0) return res.status(400).json({ok:false,error:"Valor inválido."});
    if(!process.env.MP_ACCESS_TOKEN){
      return res.status(503).json({ok:false,configured:false,error:"Mercado Pago ainda não configurado no servidor."});
    }
    const base=process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const response=await fetch("https://api.mercadopago.com/checkout/preferences",{
      method:"POST",
      headers:{"Authorization":`Bearer ${process.env.MP_ACCESS_TOKEN}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        items:[{id:externalReference||crypto.randomUUID(),title,quantity:1,currency_id:"BRL",unit_price:value}],
        external_reference:externalReference||crypto.randomUUID(),
        notification_url:notificationUrl||`${base}/api/payment/webhook`,
        back_urls:{success:`${base}/?payment=success`,failure:`${base}/?payment=failure`,pending:`${base}/?payment=pending`},
        auto_return:"approved"
      })
    });
    const data=await response.json();
    if(!response.ok)return res.status(response.status).json({ok:false,error:data?.message||"Erro ao criar cobrança.",details:data});
    res.json({ok:true,id:data.id,checkoutUrl:data.init_point||data.sandbox_init_point});
  }catch(err){res.status(500).json({ok:false,error:"Falha ao criar cobrança."});}
});

app.post("/api/payment/webhook",(req,res)=>{
  // A produção deve validar a assinatura enviada pelo provedor antes de alterar o pedido.
  // O endpoint existe para receber os eventos e será conectado ao armazenamento do CRM.
  console.log("Pagamento webhook recebido",req.body?.type||req.body?.action||"evento");
  res.sendStatus(200);
});

const cloudflarePublishTimes = new Map();
const CF_API="https://api.cloudflare.com/client/v4";
function safeProjectName(value){
  const v=String(value||"").toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48);
  return /^[a-z0-9][a-z0-9-]*$/.test(v)?v:"radar-clientes-sites";
}
async function cfApi(url, options={}){
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,...(options.headers||{})},signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({success:false,errors:[{message:"Resposta inválida da API Cloudflare."}]}));
  if(!response.ok||data.success===false) throw new Error((data.errors||[]).map(x=>x.message).filter(Boolean).join("; ")||`Cloudflare HTTP ${response.status}`);
  return data.result;
}
async function ensurePagesProject(projectName){
  const base=`${CF_API}/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/pages/projects`;
  const check=await fetch(`${base}/${encodeURIComponent(projectName)}`,{headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},signal:AbortSignal.timeout(15000)});
  if(check.ok){const d=await check.json();if(d.success&&d.result)return d.result;throw new Error((d.errors||[]).map(x=>x.message).join("; ")||"Não foi possível verificar o projeto Cloudflare Pages.");}
  if(check.status!==404){const d=await check.json().catch(()=>({}));throw new Error((d.errors||[]).map(x=>x.message).join("; ")||`Cloudflare HTTP ${check.status} ao verificar projeto.`);}
  return await cfApi(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:projectName,production_branch:"main"})});
}
app.post("/api/publish/cloudflare", adminAuth, async (req,res)=>{
  if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID){
    return res.status(503).json({ok:false,configured:false,error:"Cloudflare ainda não configurado no servidor."});
  }
  if(!await requireStorage(res)) return;
  const id=String(req.body?.id||"").trim();
  if(!id||id.length>120) return res.status(400).json({ok:false,configured:true,error:"ID de site inválido."});
  const site=state.publishedSites.find(x=>String(x.id)===id);
  if(!site?.html) return res.status(409).json({ok:false,configured:true,error:"Este projeto ainda não tem uma versão HTML pronta para publicar. Abra o projeto, salve/publice novamente e tente outra vez."});
  const now=Date.now(), client=String(req.ip||req.socket?.remoteAddress||"unknown"), previous=cloudflarePublishTimes.get(client)||0;
  if(now-previous<15000) return res.status(429).json({ok:false,configured:true,error:"Aguarde 15 segundos antes de iniciar outra publicação."});
  cloudflarePublishTimes.set(client,now);
  const projectName=safeProjectName(process.env.CLOUDFLARE_PAGES_PROJECT||"radar-clientes-sites");
  const sites=state.publishedSites.filter(x=>typeof x.html==="string"&&x.html.length>0);
  if(sites.length>1000) return res.status(413).json({ok:false,configured:true,error:"Há muitos sites guardados para uma publicação única. Separe os projetos antes de continuar."});
  const totalBytes=sites.reduce((n,x)=>n+Buffer.byteLength(x.html,"utf8"),0);
  if(totalBytes>20*1024*1024) return res.status(413).json({ok:false,configured:true,error:"O total dos sites publicados ultrapassa 20 MB. Reduza imagens incorporadas nos sites e tente novamente."});
  let tempDir;
  try{
    await ensurePagesProject(projectName);
    tempDir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"radar-pages-"));
    for(const item of sites){
      const slug=String(item.id).replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,120);
      if(!slug) continue;
      const target=path.join(tempDir,"site",slug,"index.html");
      await fs.promises.mkdir(path.dirname(target),{recursive:true});
      await fs.promises.writeFile(target,item.html,"utf8");
    }
    const wrangler=path.join(ROOT,"node_modules","wrangler","bin","wrangler.js");
    await execFileAsync(process.execPath,[wrangler,"pages","deploy",tempDir,"--project-name",projectName,"--branch","main"],{
      cwd:ROOT,timeout:180000,maxBuffer:2*1024*1024,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:process.env.CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_API_TOKEN:process.env.CLOUDFLARE_API_TOKEN}
    });
    const url=`https://${projectName}.pages.dev/site/${encodeURIComponent(String(id))}/`;
    const current=state.publishedSites.findIndex(x=>String(x.id)===id);
    if(current>=0){state.publishedSites[current]={...state.publishedSites[current],cloudflareUrl:url,cloudflareProject:projectName,cloudflarePublishedAt:new Date().toISOString()};}
    if(!await persistState()) return res.status(500).json({ok:false,configured:true,error:"A Cloudflare publicou o conteúdo, mas não foi possível salvar o endereço no banco. Tente salvar o projeto novamente."});
    res.json({ok:true,configured:true,url,project:projectName,publishedSites:sites.length});
  }catch(err){
    const detail=[err.message,err.stderr].filter(Boolean).join(" | ");
    console.error("Falha na publicação Cloudflare Pages:",detail);
    res.status(502).json({ok:false,configured:true,error:`A publicação Cloudflare falhou: ${String(detail||"erro desconhecido").slice(0,700)}`});
  }finally{if(tempDir) await fs.promises.rm(tempDir,{recursive:true,force:true}).catch(()=>{});}
});

app.post("/api/domain/connect", adminAuth, async (req,res)=>{
  const {domain}=req.body||{};
  if(!domain)return res.status(400).json({ok:false,error:"Domínio obrigatório."});
  if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID){
    return res.status(503).json({ok:false,configured:false,error:"Conector de domínio ainda não configurado no servidor."});
  }
  return res.status(501).json({ok:false,error:"O provedor de registro do domínio ainda precisa ser configurado. A conexão do Pages será feita pelo servidor."});
});

// URL pública limpa: mostra o site da demonstração, não o painel do Radar.
// V15.3.5: links curtos /site/XXXXXXXXXX não carregam dados do site na URL.
// O servidor busca a demonstração pelo código curto e o navegador renderiza o site.
app.get("/site/p/:id", (_req,res)=>{
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  res.sendFile(path.join(ROOT,"index.html"));
});

app.get("/site/:id", (_req,res)=>{
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  res.sendFile(path.join(ROOT,"index.html"));
});

app.get("/demo/:id", async (req,res)=>{
  if(!await requireStorage(res)) return;
  res.setHeader("Cache-Control","no-store");
  res.redirect(302, `/site/${encodeURIComponent(String(req.params.id))}`);
});
app.get("/demo", (_req,res)=>res.status(400).send("Link de demonstração incompleto. Use o link enviado pelo Radar."));

app.use("/data", (_req,res)=>res.sendStatus(404));

// IMPORTANTE: as rotas públicas vêm antes dos arquivos estáticos.
// Assim /site/ID sempre entrega o shell do Radar, que então consulta /api/site/ID.
app.use(express.static(ROOT));
app.listen(PORT,()=>console.log(`Radar backend V21.8.0 em http://localhost:${PORT}`));
