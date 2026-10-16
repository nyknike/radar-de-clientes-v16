import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
let state = { sales: [], platforms: [], events: [], publishedSites: [], reservations: [], orders: [] };
const storage = { configured: false, connected: false, error: null, checkedAt: null };
function normalizeState(x={}) {
  return {
    sales: Array.isArray(x.sales) ? x.sales : [],
    platforms: Array.isArray(x.platforms) ? x.platforms : [],
    events: Array.isArray(x.events) ? x.events : [],
    publishedSites: Array.isArray(x.publishedSites) ? x.publishedSites : [],
    reservations: Array.isArray(x.reservations) ? x.reservations : [],
    orders: Array.isArray(x.orders) ? x.orders : []
  };
}
function loadState(){
  try {
    fs.mkdirSync(DATA_DIR,{recursive:true});
    if(fs.existsSync(STATE_FILE)) state=normalizeState(JSON.parse(fs.readFileSync(STATE_FILE,"utf8")));
  } catch(err) { console.error("Não foi possível carregar o estado local:",err.message); }
}
async function loadRemoteState(){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  storage.configured=!!(url&&key);
  storage.checkedAt=new Date().toISOString();
  if(!url||!key){
    storage.connected=false;
    storage.error="Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no serviço Web do Render.";
    return false;
  }
  try{
    const r=await fetch(`${url.replace(/\/$/,"")}/rest/v1/radar_state?id=eq.1&select=state`,{
      headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"},
      signal:AbortSignal.timeout(10000)
    });
    if(!r.ok) throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0,240)}`);
    const rows=await r.json();
    state=normalizeState(rows[0]?.state || {});
    storage.connected=true; storage.error=null;
    return true;
  }catch(err){
    storage.connected=false;
    storage.error=err.message;
    console.error("Falha ao conectar ao Supabase:",err.message);
    return false;
  }
}
async function persistState(){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(url&&key){
    try{
      const r=await fetch(`${url.replace(/\/$/,"")}/rest/v1/radar_state?on_conflict=id`,{
        method:"POST",
        headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify({id:1,state,updated_at:new Date().toISOString()}),
        signal:AbortSignal.timeout(10000)
      });
      if(!r.ok) throw new Error(`Supabase HTTP ${r.status}: ${(await r.text()).slice(0,240)}`);
      storage.connected=true; storage.error=null; storage.checkedAt=new Date().toISOString();
      return true;
    }catch(err){ storage.connected=false; storage.error=err.message; console.error("Falha ao salvar Supabase:",err.message); return false; }
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
  if(isProduction && !storage.connected) await loadRemoteState();
  if(isProduction && !storage.connected){
    res.status(503).json({ok:false,error:"Armazenamento persistente indisponível. Configure/verifique o Supabase antes de publicar ou salvar sites.",storage:{configured:storage.configured,connected:false,detail:storage.error}});
    return false;
  }
  return true;
}

const cfg = {
  payment: process.env.MP_ACCESS_TOKEN ? "mercadopago" : "manual",
  hosting: process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID ? "cloudflare" : "manual",
  domain: process.env.DOMAIN_PROVIDER ? process.env.DOMAIN_PROVIDER : "manual"
};

app.get("/api/health", async (_req,res)=>{
  await stateReady;
  if(isProduction && !storage.connected) await loadRemoteState();
  res.status(200).json({ok:true,version:"V20.4.3",persistentStorage:storage.connected,storage:{configured:storage.configured,connected:storage.connected,error:storage.connected?null:storage.error,checkedAt:storage.checkedAt},integrations:cfg});
});

// O servidor é a fonte compartilhada dos dados entre dispositivos.
app.get("/api/state", async (_req,res)=>{if(!await requireStorage(res)) return;res.json({ok:true,state});});
app.put("/api/state", async (req,res)=>{
  if(!await requireStorage(res)) return;
  const body=req.body||{};
  if(body.sales!==undefined){ if(!Array.isArray(body.sales)) return res.status(400).json({ok:false,error:"sales precisa ser uma lista."}); state.sales=body.sales; }
  if(body.platforms!==undefined){ if(!Array.isArray(body.platforms)) return res.status(400).json({ok:false,error:"platforms precisa ser uma lista."}); state.platforms=body.platforms; }
  if(!await persistState()) return res.status(500).json({ok:false,error:"Não foi possível persistir os dados no servidor. Confira a configuração do banco ou disco."});
  res.json({ok:true,savedAt:new Date().toISOString()});
});
app.get("/api/demo/:id", async (req,res)=>{
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
    return res.json({ok:true,kind:sale?"demo":"published",platform:published.platform,sale});
  }
  // Compatibilidade com links antigos que usavam o ID da venda.
  const sale=state.sales.find(x=>String(x.id)===id);
  if(sale){
    const platform=state.publishedSites.find(x=>String(x.id)===String(sale.platformId||sale.businessId))?.platform
      ||state.platforms.find(x=>String(x.id)===String(sale.platformId||sale.businessId));
    if(!platform) return res.status(404).json({ok:false,error:"A demonstração existe, mas o projeto do site não foi encontrado no servidor."});
    return res.json({ok:true,kind:"demo",platform,sale});
  }
  const platform=state.platforms.find(x=>String(x.id)===id);
  if(!platform) return res.status(404).json({ok:false,error:"Site não encontrado no armazenamento público do servidor."});
  res.json({ok:true,kind:"published",platform,sale:null});
});

app.put("/api/public-sites/:id", async (req,res)=>{
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
  res.json({ok:true,version:"V20.4.3",persistentStorage:storage.connected,sales:state.sales.length,platforms:state.platforms.length,publishedSites:state.publishedSites.length});
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
  res.json({ok:true,event,sale});
});

// V20.4.3: entrada de reservas/pedidos e endpoints privados para o painel do estabelecimento.
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
  const supplied=String(req.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const a=Buffer.from(supplied), b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.status(401).json({ok:false,error:"Acesso administrativo não autorizado."});
  next();
}
app.post("/api/intake/reservations", limitIntake, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const b=req.body||{};
  const siteId=cleanText(b.siteId,120), name=cleanText(b.name,120), contact=cleanText(b.contact,120), date=cleanText(b.date,10), time=cleanText(b.time,10);
  if(!siteId||!name||!contact||!date||!time) return res.status(400).json({ok:false,error:"Informe estabelecimento, nome, contato, data e horário."});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ok:false,error:"Data ou horário inválido."});
  const site=state.publishedSites.find(x=>String(x.id)===siteId);
  if(!site) return res.status(404).json({ok:false,error:"Estabelecimento não encontrado."});
  const item={id:crypto.randomUUID(),siteId,name,contact,date,time,people:Math.max(1,Math.min(30,Number(b.people)||1)),service:cleanText(b.service,160),professional:cleanText(b.professional,120),notes:cleanText(b.notes,1000),status:"pending",createdAt:new Date().toISOString()};
  state.reservations.push(item);
  if(!await persistState()) return res.status(500).json({ok:false,error:"Não foi possível salvar a solicitação. Tente novamente."});
  res.status(201).json({ok:true,id:item.id,status:item.status,message:"Solicitação recebida. Ela ainda depende da confirmação do estabelecimento."});
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
app.get("/api/admin/inbox", adminAuth, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const siteId=cleanText(req.query.siteId,120);
  if(!siteId) return res.status(400).json({ok:false,error:"Informe o siteId para limitar os dados a um estabelecimento."});
  res.json({ok:true,reservations:state.reservations.filter(x=>x.siteId===siteId),orders:state.orders.filter(x=>x.siteId===siteId)});
});
app.patch("/api/admin/reservations/:id", adminAuth, async (req,res)=>{
  if(!await requireStorage(res)) return;
  const item=state.reservations.find(x=>x.id===String(req.params.id));
  if(!item) return res.status(404).json({ok:false,error:"Reserva não encontrada."});
  const siteId=cleanText(req.body?.siteId,120);
  if(!siteId||item.siteId!==siteId) return res.status(403).json({ok:false,error:"Esta reserva não pertence ao estabelecimento selecionado."});
  const status=String(req.body?.status||"");
  if(!["pending","confirmed","declined","cancelled"].includes(status)) return res.status(400).json({ok:false,error:"Estado inválido."});
  item.status=status; item.updatedAt=new Date().toISOString(); item.adminNote=cleanText(req.body?.adminNote,500);
  if(!await persistState()) return res.status(500).json({ok:false,error:"Não foi possível salvar a alteração."});
  res.json({ok:true,reservation:item});
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
app.post("/api/publish/cloudflare", async (req,res)=>{
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

app.post("/api/domain/connect", async (req,res)=>{
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
app.listen(PORT,()=>console.log(`Radar backend V20.4.3 em http://localhost:${PORT}`));
