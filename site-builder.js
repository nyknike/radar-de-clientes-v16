const SECTION_KEYS = new Set(["about", "items", "gallery", "reviews", "contact", "faq", "team", "offers", "location"]);
const STYLES = new Set(["auto", "premium", "modern", "urban", "minimal", "vibrant"]);
const LAYOUTS = new Set(["heroSplit", "heroFull", "heroCentered", "editorial"]);

function boundedText(value, max, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

export function normalizeGeneratedSite(input, { name, brief, style = "auto" } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("A resposta da IA precisa ser um objeto JSON.");
  }
  const validColor = value => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  const project = {
    title: boundedText(input.title, 180, name),
    description: boundedText(input.description, 1200, brief),
    aboutText: boundedText(input.aboutText, 1400, brief),
    offerTitle: boundedText(input.offerTitle, 120, "Destaques"),
    offerDescription: boundedText(input.offerDescription, 500, "Conheça nossos produtos e serviços."),
    font: /^[a-zA-Z ,'-]{1,60}$/.test(input.font || "") ? input.font : "system-ui",
    dark: typeof input.dark === "boolean" ? input.dark : false,
    visualStyle: STYLES.has(input.visualStyle) ? input.visualStyle : (STYLES.has(style) ? style : "auto"),
    layoutVariant: LAYOUTS.has(input.layoutVariant) ? input.layoutVariant : "heroSplit"
  };
  for (const key of ["c1", "c2", "backgroundColor", "textColor", "surfaceColor"]) {
    if (validColor(input[key])) project[key] = input[key];
  }
  project.enabledSections = Array.isArray(input.enabledSections)
    ? [...new Set(input.enabledSections.filter(key => SECTION_KEYS.has(key)))]
    : ["about", "items", "gallery", "contact", "location"];
  project.items = Array.isArray(input.items)
    ? input.items.slice(0, 16).map(item => ({
        cat: boundedText(item?.cat, 80, "Destaques"),
        name: boundedText(item?.name, 120),
        price: "",
        desc: boundedText(item?.desc, 300)
      })).filter(item => item.name)
    : [];
  project.faqItems = Array.isArray(input.faqItems)
    ? input.faqItems.slice(0, 6).map(item => ({
        q: boundedText(item?.q, 140),
        a: boundedText(item?.a, 350)
      })).filter(item => item.q && item.a)
    : [];
  if (!project.title || !project.description || project.items.length === 0) {
    throw new TypeError("A resposta da IA não contém título, descrição e pelo menos um item.");
  }
  return project;
}
