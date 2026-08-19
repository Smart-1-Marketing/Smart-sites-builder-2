import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";

const USER_AGENT = "Smart1SitesPreview/2.1 (+https://smart1sites.com)";
const MAX_HTML_BYTES = 2_500_000;
const MAX_CSS_BYTES = 500_000;
const MAX_PAGES = 7;
const MAX_STYLESHEETS = 5;
const FETCH_TIMEOUT_MS = 12_000;

const withoutWww = host => String(host || "").toLowerCase().replace(/^www\./, "");
const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if ([10, 127, 0].includes(p[0])) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd");
}

export function normalizeWebsiteUrl(value) {
  let raw = String(value || "").trim();
  if (!raw) throw new Error("Enter your current website address.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Website must use http or https.");
  url.hash = "";
  return url;
}

async function assertPublicHost(url) {
  if (!url.hostname || url.hostname === "localhost") throw new Error("That website address cannot be scanned.");
  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Error("We couldn't find that website. Check the address and try again.");
  }
  if (!addresses.length || addresses.some(x => isPrivateIp(x.address))) {
    throw new Error("That website address cannot be scanned.");
  }
}

async function readLimited(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      try { await reader.cancel(); } catch {}
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchText(startUrl, { accept, contentTypes, maxBytes }) {
  let current = new URL(startUrl);
  for (let redirects = 0; redirects < 5; redirects++) {
    await assertPublicHost(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept }
      });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The website redirected incorrectly.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`The website returned ${response.status}.`);
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (contentTypes.length && !contentTypes.some(allowed => type.includes(allowed))) {
      throw new Error("That address returned an unsupported content type.");
    }
    return { text: await readLimited(response, maxBytes), finalUrl: current.href };
  }
  throw new Error("The website redirected too many times.");
}

const fetchHtml = url => fetchText(url, {
  accept: "text/html,application/xhtml+xml",
  contentTypes: ["text/html", "application/xhtml+xml"],
  maxBytes: MAX_HTML_BYTES
});

const fetchCss = url => fetchText(url, {
  accept: "text/css,*/*;q=0.1",
  contentTypes: ["text/css", "text/plain", "application/octet-stream"],
  maxBytes: MAX_CSS_BYTES
});

function resolveUrl(value, base) {
  if (!value || /^data:|^javascript:/i.test(value)) return "";
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

const firstSrcFromSet = srcset => String(srcset || "").split(",")[0]?.trim().split(/\s+/)[0] || "";

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function likelyUsefulLink(text, url) {
  const hay = `${text} ${url.pathname}`.toLowerCase();
  return /(about|service|amenit|menu|reservation|book|contact|review|testimonial|faq|location|direction|product|event|activit|gallery|photo|team|attorney|practice|inventory|catering|camp|site|room|tour)/.test(hay);
}

function expandHex(hex) {
  let h = String(hex || "").replace("#", "").trim();
  if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : "";
}

function rgbToHex(r, g, b) {
  const clamp = value => Math.max(0, Math.min(255, Number(value) || 0));
  return `#${[r, g, b].map(v => Math.round(clamp(v)).toString(16).padStart(2, "0")).join("")}`;
}

function colorFromString(value) {
  const text = String(value || "").trim();
  const hexMatch = text.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) return expandHex(hexMatch[0]);
  const rgbMatch = text.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i);
  if (rgbMatch) return rgbToHex(rgbMatch[1], rgbMatch[2], rgbMatch[3]);
  return "";
}

function colorStats(hex) {
  const value = expandHex(hex);
  if (!value) return null;
  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { r, g, b, lightness, saturation };
}

function colorDistance(a, b) {
  const ca = colorStats(a), cb = colorStats(b);
  if (!ca || !cb) return 0;
  return Math.sqrt(
    Math.pow((ca.r - cb.r) * 255, 2) +
    Math.pow((ca.g - cb.g) * 255, 2) +
    Math.pow((ca.b - cb.b) * 255, 2)
  );
}

function mix(hex, target, amount) {
  const c = colorStats(hex), t = colorStats(target);
  if (!c || !t) return hex;
  return rgbToHex(
    (c.r + (t.r - c.r) * amount) * 255,
    (c.g + (t.g - c.g) * amount) * 255,
    (c.b + (t.b - c.b) * amount) * 255
  );
}

function addColor(map, raw, weight = 1) {
  const color = colorFromString(raw);
  if (!color) return;
  const stats = colorStats(color);
  if (!stats) return;
  if (stats.saturation < 0.08) return;
  if (stats.lightness < 0.08 || stats.lightness > 0.94) return;
  map.set(color, (map.get(color) || 0) + weight);
}

function collectColors(text, map, weight = 1) {
  const source = String(text || "");
  for (const match of source.matchAll(/#[0-9a-f]{3,8}\b/gi)) addColor(map, match[0], weight);
  for (const match of source.matchAll(/rgba?\(\s*\d{1,3}\s*[, ]\s*\d{1,3}\s*[, ]\s*\d{1,3}(?:\s*[,/]\s*[\d.]+)?\s*\)/gi)) addColor(map, match[0], weight);
  for (const match of source.matchAll(/--[\w-]*(?:brand|primary|accent|main)[\w-]*\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^;]+\))/gi)) addColor(map, match[1], weight * 8);
}

function chooseBrandColors(colorMap, themeColor = "") {
  const theme = colorFromString(themeColor);
  if (theme) addColor(colorMap, theme, 30);
  const ranked = [...colorMap.entries()]
    .map(([color, score]) => ({ color, score, stats: colorStats(color) }))
    .filter(x => x.stats && x.stats.saturation >= 0.15 && x.stats.lightness >= 0.12 && x.stats.lightness <= 0.88)
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0]?.color || theme || "#0b7bd8";
  const secondary = ranked.find(x => colorDistance(x.color, primary) >= 75)?.color || mix(primary, "#ffffff", 0.28);
  return {
    primary,
    secondary,
    dark: mix(primary, "#000000", 0.52),
    soft: mix(primary, "#ffffff", 0.90),
    palette: ranked.slice(0, 6).map(x => x.color)
  };
}

function cssBackgroundImages(source, base) {
  const urls = [];
  for (const match of String(source || "").matchAll(/url\((['"]?)(.*?)\1\)/gi)) {
    const value = match[2]?.trim();
    const url = resolveUrl(value, base);
    if (url && !/\.(svg|ico)(?:\?|$)/i.test(url)) urls.push(url);
  }
  return urls;
}

function imageRisk(url, alt = "", classes = "") {
  const text = `${url} ${alt} ${classes}`.toLowerCase();
  let risk = 0;
  if (/(logo|favicon|icon|sprite|badge|award|seal|certif|partner|sponsor|avatar)/.test(text)) risk += 100;
  if (/(screenshot|screen-shot|mockup|infographic|chart|diagram|graphic|illustration)/.test(text)) risk += 45;
  if (/\.svg(?:\?|$)/.test(text)) risk += 80;
  return risk;
}

function scoreImage({ url, alt, classes, width, height, source }) {
  let score = 0;
  const risk = imageRisk(url, alt, classes);
  score -= risk;
  if (/hero|banner|cover|featured|header|gallery|photo/.test(`${classes} ${alt}`.toLowerCase())) score += 45;
  if (source === "css-background") score += 35;
  if (source === "og") score += 28;
  if (width >= 900 || height >= 600) score += 35;
  else if (width >= 600 || height >= 400) score += 22;
  else if (width && height && (width < 260 || height < 160)) score -= 35;
  if (width && height) {
    const ratio = width / height;
    if (ratio >= 1.25 && ratio <= 2.4) score += 20;
    if (ratio > 4 || ratio < 0.45) score -= 20;
  }
  if (alt && alt.length >= 5 && alt.length <= 120) score += 6;
  return { score, graphicRisk: risk >= 45 };
}

function parsePage(pageUrl, html) {
  const $ = cheerio.load(html);
  const rawStyleText = [
    ...$("style").map((_, el) => $(el).html() || "").get(),
    ...$("[style]").map((_, el) => $(el).attr("style") || "").get()
  ].join("\n");
  const themeColor = cleanText($('meta[name="theme-color"]').attr("content") || "");
  const stylesheetUrls = $("link[rel~='stylesheet'][href]").map((_, el) => resolveUrl($(el).attr("href"), pageUrl)).get().filter(Boolean).slice(0, MAX_STYLESHEETS);

  const title = cleanText($("title").first().text());
  const metaDescription = cleanText($('meta[name="description"]').attr("content") || "");
  const siteName = cleanText($('meta[property="og:site_name"]').attr("content") || "");

  const logoCandidates = [];
  $("img").each((_, el) => {
    const node = $(el);
    const alt = cleanText(node.attr("alt") || "");
    const classes = `${node.attr("class") || ""} ${node.attr("id") || ""}`;
    if (/logo|brand/i.test(`${alt} ${classes}`)) {
      const src = node.attr("data-lazy-src") || node.attr("data-src") || node.attr("src") || firstSrcFromSet(node.attr("srcset"));
      const url = resolveUrl(src, pageUrl);
      if (url) logoCandidates.push(url);
    }
  });

  const images = [];
  const ogImage = resolveUrl($('meta[property="og:image"]').attr("content"), pageUrl);
  if (ogImage) {
    const scored = scoreImage({ url: ogImage, alt: "Featured image", classes: "", width: 0, height: 0, source: "og" });
    images.push({ url: ogImage, alt: "Featured image", width: 0, height: 0, source: "og", ...scored });
  }

  for (const url of cssBackgroundImages(rawStyleText, pageUrl)) {
    const scored = scoreImage({ url, alt: "", classes: "hero background", width: 0, height: 0, source: "css-background" });
    images.push({ url, alt: "", width: 0, height: 0, source: "css-background", ...scored });
  }

  $("img").each((_, el) => {
    const node = $(el);
    const src = node.attr("data-lazy-src") || node.attr("data-src") || node.attr("data-original") || node.attr("src") || firstSrcFromSet(node.attr("srcset"));
    const url = resolveUrl(src, pageUrl);
    if (!url) return;
    const alt = cleanText(node.attr("alt") || "");
    const classes = `${node.attr("class") || ""} ${node.attr("id") || ""}`.toLowerCase();
    const width = Number(node.attr("width") || 0);
    const height = Number(node.attr("height") || 0);
    const scored = scoreImage({ url, alt, classes, width, height, source: "img" });
    images.push({ url, alt, width, height, source: "img", ...scored });
  });

  $("script,noscript,template,svg,style").remove();
  const headings = [];
  $("h1,h2,h3").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length >= 3 && text.length <= 180) headings.push(text);
  });
  const paragraphs = [];
  $("p,li").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length >= 35 && text.length <= 700) paragraphs.push(text);
  });

  const links = [];
  $("a[href]").each((_, el) => {
    const raw = $(el).attr("href") || "";
    const text = cleanText($(el).text() || $(el).attr("aria-label") || "");
    if (/^tel:/i.test(raw) || /^mailto:/i.test(raw)) {
      links.push({ text, url: raw });
      return;
    }
    const url = resolveUrl(raw, pageUrl);
    if (url) links.push({ text, url });
  });

  const ctas = links.filter(link => /(reserve|book|schedule|appointment|quote|contact|call|order|shop|buy|apply|start|get started|plan your stay|learn more)/i.test(link.text));
  const phones = links.filter(x => x.url.startsWith("tel:")).map(x => x.url.replace(/^tel:/, ""));
  const emails = links.filter(x => x.url.startsWith("mailto:")).map(x => x.url.replace(/^mailto:/, "").split("?")[0]);

  return {
    url: pageUrl,
    title,
    metaDescription,
    siteName,
    themeColor,
    rawStyleText,
    stylesheetUrls,
    logo: logoCandidates[0] || "",
    headings: [...new Set(headings)].slice(0, 30),
    paragraphs: [...new Set(paragraphs)].slice(0, 45),
    links: uniqueBy(links, x => x.url).slice(0, 100),
    ctas: uniqueBy(ctas, x => `${x.text}|${x.url}`).slice(0, 18),
    phones: [...new Set(phones)],
    emails: [...new Set(emails)],
    images: uniqueBy(images, x => x.url).sort((a, b) => b.score - a.score).slice(0, 32)
  };
}

async function loadBrandColors(home) {
  const colors = new Map();
  collectColors(home.rawStyleText, colors, 2);
  if (home.themeColor) addColor(colors, home.themeColor, 30);
  const cssFiles = [];
  for (const url of home.stylesheetUrls.slice(0, MAX_STYLESHEETS)) {
    try {
      const result = await fetchCss(url);
      cssFiles.push(result.text);
    } catch {
      // Styling on a CDN can be blocked without preventing the website preview.
    }
  }
  collectColors(cssFiles.join("\n"), colors, 1);
  return chooseBrandColors(colors, home.themeColor);
}

export async function crawlWebsite(inputUrl) {
  const start = normalizeWebsiteUrl(inputUrl);
  const homeFetch = await fetchHtml(start);
  const homeUrl = new URL(homeFetch.finalUrl);
  const siteRoot = withoutWww(homeUrl.hostname);
  const home = parsePage(homeFetch.finalUrl, homeFetch.text);
  const brandColors = await loadBrandColors(home);
  const pages = [home];
  const seen = new Set([home.url]);

  const candidates = home.links
    .filter(link => /^https?:/i.test(link.url))
    .map(link => ({ ...link, parsed: new URL(link.url) }))
    .filter(link =>
      withoutWww(link.parsed.hostname) === siteRoot &&
      likelyUsefulLink(link.text, link.parsed) &&
      !/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3)$/i.test(link.parsed.pathname)
    );

  for (const candidate of candidates) {
    if (pages.length >= MAX_PAGES) break;
    if (seen.has(candidate.parsed.href)) continue;
    seen.add(candidate.parsed.href);
    try {
      const fetched = await fetchHtml(candidate.parsed.href);
      pages.push(parsePage(fetched.finalUrl, fetched.text));
    } catch {
      // A blocked interior page should not kill the customer preview.
    }
  }

  const allImages = uniqueBy(
    pages.flatMap((page, pageIndex) => page.images.map(image => ({ ...image, pageIndex }))),
    x => x.url
  ).sort((a, b) => (b.score + (b.pageIndex === 0 ? 12 : 0)) - (a.score + (a.pageIndex === 0 ? 12 : 0)));

  const strongImages = allImages.filter(image => !image.graphicRisk && image.score >= 0);
  const presentationImages = (strongImages.length >= 4 ? strongImages : allImages.filter(image => image.score >= -15)).slice(0, 24);
  const links = uniqueBy(pages.flatMap(page => page.links), x => x.url);
  const ctas = uniqueBy(pages.flatMap(page => page.ctas), x => `${x.text}|${x.url}`);
  const headings = [...new Set(pages.flatMap(page => page.headings))];
  const paragraphs = [...new Set(pages.flatMap(page => page.paragraphs))];

  return {
    requestedUrl: inputUrl,
    finalUrl: home.url,
    domain: homeUrl.hostname,
    title: home.title,
    siteName: home.siteName,
    metaDescription: home.metaDescription,
    logo: home.logo,
    brandColors,
    pages: pages.map(page => ({
      url: page.url,
      title: page.title,
      headings: page.headings.slice(0, 12),
      paragraphs: page.paragraphs.slice(0, 18)
    })),
    headings: headings.slice(0, 60),
    paragraphs: paragraphs.slice(0, 90),
    images: presentationImages,
    allImages: allImages.slice(0, 40),
    links: links.slice(0, 140),
    ctas: ctas.slice(0, 30),
    phones: [...new Set(pages.flatMap(page => page.phones))],
    emails: [...new Set(pages.flatMap(page => page.emails))],
    combinedText: pages.map(page => [
      page.title,
      page.metaDescription,
      page.headings.join("\n"),
      page.paragraphs.join("\n")
    ].filter(Boolean).join("\n")).join("\n\n--- PAGE ---\n\n").slice(0, 75_000)
  };
}
