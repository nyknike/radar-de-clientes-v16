// V21.9.2 — validação e normalização de dados estruturados gerados pela IA.
// Este módulo nunca executa HTML, CSS ou JavaScript fornecido pelo modelo.
import crypto from 'node:crypto';

const HEX = /^#[0-9a-f]{6}$/i;
const STYLES = new Set(['auto','premium','modern','urban','minimal','vibrant']);
const LAYOUTS = new Set(['heroSplit','heroFull','heroCentered','editorial']);
const SECTIONS = new Set(['about','items','gallery','reviews','contact','faq','team','offers','location']);
const clean = (value, max, fallback = '') => String(value ?? fallback).replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, max);
const color = (value, fallback) => typeof value === 'string' && HEX.test(value) ? value : fallback;

export function normalizeGeneratedSite(input = {}, context = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('A resposta da IA não contém um objeto de site válido.');
  }
  const name = clean(context.name, 120, 'Novo negócio') || 'Novo negócio';
  const brief = clean(context.brief ?? context.instruction, 3000);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems.slice(0, 12).map((item) => ({
    cat: clean(item?.cat, 80, 'Destaques'),
    name: clean(item?.name, 120),
    price: '',
    desc: clean(item?.desc, 300),
    img: ''
  })).filter(item => item.name);
  if (items.length < 2) throw new Error('A IA gerou menos de dois produtos ou serviços válidos. Tente detalhar melhor o negócio.');
  const rawSections = Array.isArray(input.enabledSections) ? input.enabledSections : Array.isArray(input.sections) ? input.sections : ['about','items','gallery','contact','location'];
  const selected = new Set(rawSections.map(section => typeof section === 'string' ? section : section?.k).filter(section => SECTIONS.has(section)));
  if (!selected.size) ['about','items','gallery','contact'].forEach(section => selected.add(section));
  const sections = [...SECTIONS].map(k => ({ k, on: selected.has(k) }));
  const faqItems = Array.isArray(input.faqItems) ? input.faqItems.slice(0, 6).map(item => ({
    q: clean(item?.q, 140), a: clean(item?.a, 350)
  })).filter(item => item.q && item.a) : [];
  const visualStyle = STYLES.has(input.visualStyle) ? input.visualStyle : clean(context.style, 30, 'modern');
  return {
    id: crypto.randomUUID(), name, type: clean(context.type, 40, 'other'),
    title: clean(input.title, 180, name) || name,
    description: clean(input.description, 1200, brief),
    aboutText: clean(input.aboutText, 1400), offerTitle: clean(input.offerTitle, 120),
    offerDescription: clean(input.offerDescription, 500),
    c1: color(input.c1, '#536dfe'), c2: color(input.c2, '#172033'),
    backgroundColor: color(input.backgroundColor, '#f5f6f8'),
    textColor: color(input.textColor, '#171923'), surfaceColor: color(input.surfaceColor, '#ffffff'),
    font: /^[a-zA-Z ,'-]{1,60}$/.test(String(input.font || '')) ? input.font : 'system-ui',
    headingSize: Math.max(32, Math.min(88, Math.round(Number(input.headingSize) || 64))),
    bodySize: Math.max(12, Math.min(24, Math.round(Number(input.bodySize) || 16))),
    dark: typeof input.dark === 'boolean' ? input.dark : false,
    btn: ['pill','round','square'].includes(input.btn) ? input.btn : 'round',
    visualStyle, layoutVariant: LAYOUTS.has(input.layoutVariant) ? input.layoutVariant : 'heroSplit',
    items, sections, faqItems, gallery: [], reviews: [], level: 'professional',
    contentIsSuggested: false, published: false, aiGenerated: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}
