const $ = id => document.getElementById(id);
let previewData = null;
let activeDesign = null;
let sourceWebsite = "";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const safeUrl = value => { try { const url = new URL(String(value || "")); return ["http:","https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;

function showScreen(number) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  $(`screen${number}`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => $("toast").classList.remove("show"), 3400);
}

const loadingStages = [
  ["Reading your current website…", "Finding your pages, logo and calls to action."],
  ["Learning your brand…", "Detecting the colors and visual identity your customers already know."],
  ["Choosing your best photography…", "Filtering out logos, badges and text-heavy graphics for stronger website imagery."],
  ["Matching real Smart 1 themes…", "Finding different theme structures that fit your business and content."]
];
let loadingTimer = null;
function startLoading() {
  $("loading").classList.add("show");
  let stage = 0;
  const update = () => {
    const [title, copy] = loadingStages[Math.min(stage, 3)];
    $("loadingTitle").textContent = title;
    $("loadingCopy").textContent = copy;
    $("progressBar").style.width = `${18 + stage * 24}%`;
    document.querySelectorAll(".scan-steps span").forEach((el, i) => el.classList.toggle("active", i <= stage));
    stage++;
  };
  update();
  loadingTimer = setInterval(update, 2800);
}
function stopLoading() {
  clearInterval(loadingTimer);
  $("progressBar").style.width = "100%";
  setTimeout(() => $("loading").classList.remove("show"), 250);
}

function photo(url, alt = "", className = "") {
  const safe = safeUrl(url);
  return safe ? `<img class="${esc(className)}" src="${esc(safe)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">` : "";
}
function brandPalette(content) {
  const brand = content.brand_colors || {};
  const primary = safeColor(brand.primary, "#0b7bd8");
  const secondary = safeColor(brand.secondary, primary);
  const dark = safeColor(brand.dark, "#102542");
  const soft = safeColor(brand.soft, "#eef6fc");
  const palette = [...new Set([primary, secondary, ...(brand.palette || []).map(c => safeColor(c, "")).filter(Boolean)])].slice(0, 5);
  return { primary, secondary, dark, soft, palette };
}
function brandStyle(content) {
  const p = brandPalette(content);
  return `--accent:${p.primary};--secondary:${p.secondary};--deep:${p.dark};--soft:${p.soft}`;
}
function renderBrandSwatches() {
  const p = brandPalette(previewData.content);
  $("brandSwatches").innerHTML = `${p.palette.map(color => `<span style="background:${esc(color)}" title="${esc(color)}"></span>`).join("")}<small>These colors stay consistent in every personalized theme preview</small>`;
}

function themeCard(design, content) {
  const actualThumb = safeUrl(design.templateThumb);
  const fallback = safeUrl(content.hero?.image_url || content.gallery?.[0] || "");
  const image = actualThumb || fallback;
  return `
    <button class="design-card theme-choice ${design.key === activeDesign?.key ? "selected" : ""}" data-design="${esc(design.key)}" type="button">
      ${design.recommended ? '<span class="recommended">Recommended</span>' : ""}
      <div class="mini-site real-theme-thumb">
        ${image ? photo(image, `${design.label} Smart 1 theme`) : '<div class="theme-fallback-art"></div>'}
        ${actualThumb ? '<span class="theme-source">Actual Smart 1 theme</span>' : '<span class="theme-source">Personalized preview layout</span>'}
      </div>
      <div class="design-card-body">
        <strong>${esc(design.label)}</strong>
        <span>${esc(design.description || "Smart 1 website theme")}</span>
        <em>${design.templateId ? `Theme #${esc(design.templateId)}` : "Preview layout"}</em>
      </div>
    </button>`;
}
function renderDesignChoices() {
  $("designChoices").innerHTML = previewData.designs.map(d => themeCard(d, previewData.content)).join("");
  document.querySelectorAll("[data-design]").forEach(button => button.onclick = () => setActiveDesign(button.dataset.design));
  guardImages($("designChoices"));
}

function guardImages(root) {
  root?.querySelectorAll("img").forEach(image => {
    image.addEventListener("error", () => {
      const parent = image.parentElement;
      image.remove();
      parent?.classList.add("image-placeholder");
    }, { once: true });
  });
}

function common(content) {
  const hero = safeUrl(content.hero?.image_url || content.gallery?.[0] || "");
  const logo = safeUrl(content.logo || "");
  const features = (content.features || []).slice(0, 6);
  const gallery = (content.gallery || []).slice(0, 5);
  const faqs = (content.faqs || []).slice(0, 5);
  const stats = (content.stats || []).slice(0, 4);
  const primaryUrl = safeUrl(content.primary_cta?.url) || previewData.business.sourceUrl;
  const secondaryUrl = safeUrl(content.secondary_cta?.url) || previewData.business.sourceUrl;
  const nav = (content.nav || []).slice(0, 4);
  return { hero, logo, features, gallery, faqs, stats, primaryUrl, secondaryUrl, nav };
}
function logoMarkup(content, logo) { return logo ? photo(logo, content.business_name) : esc(content.business_name); }
function navMarkup(content, x) {
  return `<header class="preview-nav"><div class="preview-logo">${logoMarkup(content, x.logo)}</div><nav class="preview-links">${x.nav.map((n,i)=>`<button type="button" data-scroll="${i===0?"top":"features"}">${esc(n.label)}</button>`).join("")}<a class="preview-cta" href="${esc(x.primaryUrl)}" target="_blank" rel="noopener">${esc(content.primary_cta?.label || "Get Started")}</a></nav></header>`;
}
function featureCards(features, className="feature-grid") {
  return `<div class="${className}">${features.map(f=>`<article class="feature">${f.image_url?`<div class="feature-media">${photo(f.image_url,f.title)}</div>`:""}<div class="feature-copy"><h4>${esc(f.title)}</h4><p>${esc(f.body)}</p></div></article>`).join("")}</div>`;
}
function faqMarkup(faqs) {
  if (!faqs.length) return "";
  return `<section class="section soft"><div class="section-heading2"><span>Good to know</span><h3>Frequently asked questions</h3></div><div class="faq-list">${faqs.map(f=>`<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join("")}</div></section>`;
}
function finalCta(content,x) {
  return `<section class="final-cta"><h3>${esc(`Ready for ${content.business_name}?`)}</h3><p>${esc(content.hero?.subheadline || "")}</p><a href="${esc(x.primaryUrl)}" target="_blank" rel="noopener">${esc(content.primary_cta?.label || "Get Started")} →</a></section>`;
}
function footer(content) { return `<footer class="preview-footer"><span>${esc(content.business_name)}</span><span>${esc([content.phone,content.email].filter(Boolean).join(" · "))}</span></footer>`; }

function buildSplit(content) {
  const x=common(content);
  return `<article class="preview-site structure-split" style="${brandStyle(content)}">
    <div class="promo-bar">${esc(content.tagline || content.location || `Welcome to ${content.business_name}`)}</div>${navMarkup(content,x)}
    <section class="hero split"><div class="hero-copy" id="preview-top"><div class="hero-kicker">${esc(content.hero?.eyebrow || content.industry)}</div><h2>${esc(content.hero?.headline || content.business_name)}</h2><p>${esc(content.hero?.subheadline || "")}</p><div class="hero-actions"><a class="primary-link" href="${esc(x.primaryUrl)}" target="_blank">${esc(content.primary_cta?.label||"Get Started")} →</a><a class="secondary-link" href="${esc(x.secondaryUrl)}" target="_blank">${esc(content.secondary_cta?.label||"Learn More")}</a></div></div><div class="hero-image">${photo(x.hero,content.business_name)}</div></section>
    ${x.stats.length?`<section class="stats">${x.stats.map(s=>`<div class="stat"><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></div>`).join("")}</section>`:""}
    <section class="section soft" id="preview-features"><div class="section-heading2"><span>Explore</span><h3>${esc(content.feature_heading || `Explore ${content.business_name}`)}</h3></div>${featureCards(x.features.slice(0,3))}</section>
    <section class="story"><div class="story-image">${photo(content.story?.image_url,content.story?.heading||content.business_name)}</div><div class="story-copy"><div class="hero-kicker">${esc(content.location||content.industry)}</div><h3>${esc(content.story?.heading||`About ${content.business_name}`)}</h3><p>${esc(content.story?.body||"")}</p></div></section>
    ${faqMarkup(x.faqs)}${finalCta(content,x)}${footer(content)}</article>`;
}

function buildImmersive(content) {
  const x=common(content);
  return `<article class="preview-site structure-immersive" style="${brandStyle(content)}">${navMarkup(content,x)}
    <section class="immersive-hero" id="preview-top">${x.hero?photo(x.hero,content.business_name,"immersive-bg"):""}<div class="immersive-shade"></div><div class="immersive-copy"><div class="hero-kicker">${esc(content.hero?.eyebrow||content.location||content.industry)}</div><h2>${esc(content.hero?.headline||content.business_name)}</h2><p>${esc(content.hero?.subheadline||"")}</p><a class="primary-link" href="${esc(x.primaryUrl)}" target="_blank">${esc(content.primary_cta?.label||"Get Started")} →</a></div></section>
    <section class="floating-feature-band" id="preview-features">${x.features.slice(0,3).map(f=>`<article><strong>${esc(f.title)}</strong><span>${esc(f.body)}</span></article>`).join("")}</section>
    <section class="alternating-section">${x.features.slice(0,4).map((f,i)=>`<article class="alternating-row ${i%2?"reverse":""}"><div class="alternating-image">${photo(f.image_url,f.title)}</div><div class="alternating-copy"><div class="hero-kicker">${String(i+1).padStart(2,"0")}</div><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></div></article>`).join("")}</section>
    ${x.gallery.length>=3?`<section class="section soft"><div class="section-heading2"><span>Gallery</span><h3>${esc(content.gallery_heading||`Experience ${content.business_name}`)}</h3></div><div class="gallery immersive-gallery">${x.gallery.map((g,i)=>`<div class="gallery-item">${photo(g,`${content.business_name} ${i+1}`)}</div>`).join("")}</div></section>`:""}
    ${faqMarkup(x.faqs)}${finalCta(content,x)}${footer(content)}</article>`;
}

function buildEditorial(content) {
  const x=common(content);
  return `<article class="preview-site structure-editorial" style="${brandStyle(content)}"><div class="editorial-top">${navMarkup(content,x)}</div>
    <section class="editorial-hero" id="preview-top"><div class="editorial-title"><div class="hero-kicker">${esc(content.hero?.eyebrow||content.industry)}</div><h2>${esc(content.hero?.headline||content.business_name)}</h2><p>${esc(content.hero?.subheadline||"")}</p><div class="hero-actions"><a class="primary-link" href="${esc(x.primaryUrl)}" target="_blank">${esc(content.primary_cta?.label||"Get Started")}</a></div></div><div class="editorial-photo">${photo(x.hero,content.business_name)}</div></section>
    <section class="editorial-index" id="preview-features"><span>What we offer</span>${x.features.slice(0,4).map((f,i)=>`<article><b>${String(i+1).padStart(2,"0")}</b><div><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></div></article>`).join("")}</section>
    <section class="editorial-story"><div class="editorial-story-copy"><div class="hero-kicker">Our story</div><h3>${esc(content.story?.heading||`About ${content.business_name}`)}</h3><p>${esc(content.story?.body||"")}</p></div><div class="editorial-story-photo">${photo(content.story?.image_url,content.story?.heading||content.business_name)}</div></section>
    ${x.gallery.length>=3?`<section class="editorial-gallery">${x.gallery.slice(0,4).map((g,i)=>`<div>${photo(g,`${content.business_name} ${i+1}`)}</div>`).join("")}</section>`:""}
    ${faqMarkup(x.faqs)}${finalCta(content,x)}${footer(content)}</article>`;
}

function buildStacked(content) {
  const x=common(content);
  return `<article class="preview-site structure-stacked" style="${brandStyle(content)}">${navMarkup(content,x)}
    <section class="stacked-hero" id="preview-top"><div class="stacked-copy"><div class="hero-kicker">${esc(content.location||content.industry)}</div><h2>${esc(content.hero?.headline||content.business_name)}</h2><p>${esc(content.hero?.subheadline||"")}</p><a class="primary-link" href="${esc(x.primaryUrl)}" target="_blank">${esc(content.primary_cta?.label||"Get Started")} →</a></div><div class="stacked-photo">${photo(x.hero,content.business_name)}</div></section>
    <section class="trust-strip"><strong>${esc(content.business_name)}</strong><span>${esc(content.tagline||"Built around what your customers need most")}</span></section>
    <section class="stacked-services" id="preview-features">${x.features.slice(0,5).map((f,i)=>`<article><div class="stacked-service-image">${photo(f.image_url,f.title)}</div><div><span>${String(i+1).padStart(2,"0")}</span><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></div></article>`).join("")}</section>
    <section class="stacked-story"><div><div class="hero-kicker">Why choose us</div><h3>${esc(content.story?.heading||`About ${content.business_name}`)}</h3><p>${esc(content.story?.body||"")}</p></div>${content.story?.image_url?`<div>${photo(content.story.image_url,content.story.heading||content.business_name)}</div>`:""}</section>
    ${faqMarkup(x.faqs)}${finalCta(content,x)}${footer(content)}</article>`;
}

function buildPreview(content, design) {
  if (design.layout === "immersive") return buildImmersive(content);
  if (design.layout === "editorial") return buildEditorial(content);
  if (design.layout === "stacked") return buildStacked(content);
  return buildSplit(content);
}

function setActiveDesign(key) {
  const design = previewData.designs.find(item => item.key === key);
  if (!design) return;
  activeDesign = design;
  renderDesignChoices();
  $("activeDesignName").textContent = `${design.label}${design.recommended ? " — Recommended" : ""}`;
  $("websitePreview").innerHTML = buildPreview(previewData.content, design);
  $("websitePreview").scrollTop = 0;
  $("previewAddress").textContent = new URL(previewData.business.sourceUrl).hostname;
  $("openTheme").disabled = !safeUrl(design.templatePreviewUrl);
  $("openTheme").onclick = () => { const url = safeUrl(design.templatePreviewUrl); if (url) window.open(url, "_blank", "noopener"); else toast("A full original theme preview is not available for this design."); };
  guardImages($("websitePreview"));
  $("websitePreview").querySelectorAll("[data-scroll]").forEach(button => {
    button.onclick = () => {
      const target = $("websitePreview").querySelector(button.dataset.scroll === "top" ? "#preview-top" : "#preview-features");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
}

function chooseActiveDesign() {
  if (!activeDesign || !previewData) return;
  const image = safeUrl(activeDesign.templateThumb) || safeUrl(previewData.content.hero?.image_url || previewData.content.gallery?.[0] || "");
  $("finishTitle").textContent = `${activeDesign.label} is ready for ${previewData.content.business_name}.`;
  $("finishCopy").textContent = "Create your Smart 1 Sites account and we’ll create this selected Smart 1 theme using the brand colors from your current website.";
  $("favoriteMini").style.cssText = brandStyle(previewData.content);
  $("favoriteMini").innerHTML = `${image ? photo(image, "") : ""}<div class="fav-copy"><strong>${esc(activeDesign.label)}</strong><span>${esc(previewData.content.business_name)}</span></div>`;
  guardImages($("favoriteMini"));
  showScreen(3);
}

$("websiteForm").onsubmit = async event => {
  event.preventDefault();
  sourceWebsite = $("websiteUrl").value.trim();
  const companyName = $("companyName").value.trim();
  if (!companyName || !sourceWebsite) return;
  startLoading();
  try {
    const response = await fetch("/api/build-preview", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ companyName, websiteUrl:sourceWebsite, primaryGoal:$("primaryGoal").value, businessType:$("businessType").value.trim() }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "We couldn't create the preview.");
    previewData = data;
    activeDesign = data.designs.find(d => d.key === data.recommendedDesignKey) || data.designs[0];
    $("designHeading").textContent = `${companyName}, choose your new Smart 1 theme.`;
    renderBrandSwatches(); renderDesignChoices(); setActiveDesign(activeDesign.key);
    $("openOriginal").onclick = () => window.open(data.business.sourceUrl, "_blank", "noopener");
    showScreen(2);
  } catch (error) { toast(error.message || "We couldn't read that website. Please check the address and try again."); }
  finally { stopLoading(); }
};

$("editWebsite").onclick = () => showScreen(1);
$("chooseDesignTop").onclick = chooseActiveDesign;
$("chooseDesignBottom").onclick = chooseActiveDesign;
$("backToDesigns").onclick = () => showScreen(2);

$("signupForm").onsubmit = async event => {
  event.preventDefault();
  if (!previewData || !activeDesign) return;
  const button = $("finishButton"), originalText = button.textContent;
  button.disabled = true; button.textContent = "Creating Your Smart 1 Site…";
  try {
    const response = await fetch("/api/register", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ previewId:previewData.previewId, designKey:activeDesign.key, fullName:$("fullName").value.trim(), email:$("accountEmail").value.trim(), password:$("accountPassword").value, agreed:$("agreeTerms").checked }) });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === "ACCOUNT_EXISTS" && data.loginUrl) $("signupForm").insertAdjacentHTML("beforeend", `<p class="account-exists">You already have an account. <a href="${esc(data.loginUrl)}">Sign in to Smart 1 Sites →</a></p>`);
      throw new Error(data.error || "We couldn't create your account.");
    }
    button.textContent = data.sso ? "Opening Your Website Builder…" : "Your Site Is Ready — Sign In →";
    window.location.href = data.accessUrl;
  } catch (error) { toast(error.message || "We couldn't finish creating your site. Please try again."); button.disabled=false; button.textContent=originalText; }
};
