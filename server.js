import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import crypto from "node:crypto";
import { crawlWebsite } from "./crawler.js";
import { buildPlan } from "./ai-planner.js";
import {
  getSimvolyConfig,
  listWebsiteTemplates,
  createUser,
  searchUser,
  deleteUser,
  createWebsite,
  startBuildingSession
} from "./simvoly-client.js";
import { scoreTemplates } from "./template-scorer.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "600kb" }));
app.use(express.static("public", { maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const model = process.env.OPENAI_MODEL || "gpt-5.6";
const buildCache = new Map();
const previewSessions = new Map();
const PREVIEW_TTL_MS = 45 * 60 * 1000;

const LAYOUT_RECIPES = [
  { layout: "split", fallbackLabel: "Modern Split", fallbackDescription: "Strong split hero, feature cards and a clean conversion path." },
  { layout: "immersive", fallbackLabel: "Immersive Story", fallbackDescription: "Full-width photography, visual feature bands and a destination-style feel." },
  { layout: "editorial", fallbackLabel: "Editorial", fallbackDescription: "Large typography, offset imagery and a more premium story-led layout." },
  { layout: "stacked", fallbackLabel: "Classic Conversion", fallbackDescription: "Compact navigation, trust sections and alternating content blocks." }
];

function makeDesigns(ranked, selectedId) {
  const list = [...ranked];
  const index = list.findIndex(template => template.id === selectedId);
  if (index > 0) {
    const [selected] = list.splice(index, 1);
    list.unshift(selected);
  }

  return LAYOUT_RECIPES.map((recipe, recipeIndex) => {
    const template = list[recipeIndex] || null;
    const categories = [template?.primaryCategories, template?.categories].filter(Boolean).join(" · ");
    return {
      key: `${recipe.layout}-${template?.id || `preview-${recipeIndex + 1}`}`,
      label: template?.name || recipe.fallbackLabel,
      description: categories || recipe.fallbackDescription,
      layout: recipe.layout,
      recommended: recipeIndex === 0,
      templateId: template?.id || null,
      templateThumb: template?.thumb || "",
      templatePreviewUrl: template?.previewUrl || "",
      systemTemplate: Boolean(template?.systemTemplate),
      primaryCategories: template?.primaryCategories || "",
      categories: template?.categories || ""
    };
  });
}


function sanitizePreviewInput(body = {}) {
  return {
    companyName: String(body.companyName || "").trim().slice(0, 120),
    websiteUrl: String(body.websiteUrl || "").trim(),
    primaryGoal: ["lead", "call", "appointment", "quote", "online_order", "reservation"].includes(body.primaryGoal)
      ? body.primaryGoal
      : "lead",
    businessType: String(body.businessType || "").trim().slice(0, 120),
    city: String(body.city || "").trim().slice(0, 120)
  };
}

function cacheKey(input) {
  return crypto.createHash("sha256")
    .update(`${input.companyName.toLowerCase()}|${input.websiteUrl.trim().toLowerCase()}|${input.primaryGoal}|${input.businessType}`)
    .digest("hex");
}

function cleanExpiredPreviews() {
  const now = Date.now();
  for (const [id, entry] of previewSessions.entries()) {
    if (now - entry.at > PREVIEW_TTL_MS) previewSessions.delete(id);
  }
}

function normalizeHex(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : "";
}

function buildPlatformColors(brandColors = {}) {
  const palette = Array.isArray(brandColors.palette) ? brandColors.palette.map(normalizeHex).filter(Boolean) : [];
  const primary = normalizeHex(brandColors.primary) || palette[0] || "#0b7bd8";
  const secondary = normalizeHex(brandColors.secondary) || palette.find(color => color !== primary) || primary;
  const extras = palette.filter(color => color !== primary && color !== secondary);
  return {
    brandColor: primary,
    secondaryColor1: secondary,
    secondaryColor2: extras[0] || normalizeHex(brandColors.dark) || primary,
    secondaryColor3: extras[1] || normalizeHex(brandColors.soft) || secondary,
    secondaryColor4: extras[2] || primary
  };
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

async function sendLeadWebhook(payload) {
  if (!process.env.SMART1_LEAD_WEBHOOK_URL) return;
  try {
    await fetch(process.env.SMART1_LEAD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });
  } catch (error) {
    console.warn("Lead webhook failed:", error.message);
  }
}

app.get("/health", (req, res) => res.status(200).type("text/plain").send("ok"));

app.get("/api/health", (req, res) => {
  const config = getSimvolyConfig();
  res.json({
    ok: true,
    aiConfigured: Boolean(openai),
    templatesConfigured: Boolean(config.apiBase && config.clientKey),
    ssoConfigured: Boolean(config.apiBase && config.platformKey)
  });
});

app.get("/api/templates", async (req, res) => {
  try {
    const templates = await listWebsiteTemplates({ visibleOnly: req.query.all !== "1" });
    res.json({ count: templates.length, templates });
  } catch (error) {
    res.status(error.code === "SIMVOLY_NOT_CONFIGURED" ? 503 : 502).json({ error: error.message });
  }
});

app.post("/api/build-preview", async (req, res) => {
  const input = sanitizePreviewInput(req.body);
  if (!input.companyName) return res.status(400).json({ error: "Enter your company name." });
  if (!input.websiteUrl) return res.status(400).json({ error: "Enter your current website address." });

  cleanExpiredPreviews();
  const key = cacheKey(input);
  const cached = buildCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    const previewId = crypto.randomUUID();
    previewSessions.set(previewId, { at: Date.now(), value: cached.value, input });
    return res.json({ ...cached.value, previewId });
  }

  try {
    const crawl = await crawlWebsite(input.websiteUrl);
    let templates = [];
    try {
      templates = await listWebsiteTemplates({ visibleOnly: true });
    } catch (error) {
      console.warn("Live template catalog unavailable:", error.message);
    }

    const ranked = scoreTemplates(templates, {
      ...input,
      title: crawl.title,
      siteName: crawl.siteName,
      metaDescription: crawl.metaDescription,
      headings: crawl.headings
    });

    const { plan, mode } = await buildPlan({ client: openai, model, crawl, input, templates: ranked });
    const designOptions = makeDesigns(ranked, plan.selected_template_id);
    const value = {
      business: {
        name: input.companyName,
        sourceUrl: crawl.finalUrl,
        pagesScanned: crawl.pages.length
      },
      content: {
        ...plan,
        business_name: input.companyName,
        logo: crawl.logo,
        brand_colors: crawl.brandColors
      },
      designs: designOptions,
      recommendedDesignKey: designOptions[0].key,
      mode
    };

    buildCache.set(key, { at: Date.now(), value });
    const previewId = crypto.randomUUID();
    previewSessions.set(previewId, { at: Date.now(), value, input });
    res.json({ ...value, previewId });
  } catch (error) {
    console.error("Preview build failed:", error);
    res.status(422).json({
      error: error.message || "We couldn't read that website. Check the address and try again."
    });
  }
});

app.post("/api/register", async (req, res) => {
  cleanExpiredPreviews();
  const previewId = String(req.body?.previewId || "");
  const designKey = String(req.body?.designKey || "");
  const fullName = String(req.body?.fullName || "").trim().slice(0, 120);
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 180);
  const password = String(req.body?.password || "");
  const agreed = req.body?.agreed === true;

  if (!previewId || !previewSessions.has(previewId)) {
    return res.status(410).json({ error: "Your preview expired. Please rebuild it and choose your design again." });
  }
  if (!fullName) return res.status(400).json({ error: "Enter your name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Use a password with at least 8 characters." });
  if (!agreed) return res.status(400).json({ error: "Please agree to the Privacy Policy and Terms & Conditions." });

  const sessionEntry = previewSessions.get(previewId);
  const { value } = sessionEntry;
  const design = value.designs.find(item => item.key === designKey);
  if (!design) return res.status(400).json({ error: "Choose a website design before creating your account." });
  if (!design.templateId) {
    return res.status(503).json({ error: "Your design is ready, but the live template catalog is temporarily unavailable. Please try again shortly." });
  }

  let existing = null;
  try {
    existing = await searchUser(email);
  } catch (error) {
    if (![404, 422].includes(error.status)) console.warn("User search warning:", error.message);
  }
  if (existing?.id) {
    return res.status(409).json({
      code: "ACCOUNT_EXISTS",
      error: "An account already exists for this email. Please sign in instead.",
      loginUrl: "https://smart1sites.com/login"
    });
  }

  let user = null;
  try {
    user = await createUser({ name: fullName, email, password, locale: "en" });
    const userId = user?.id;
    if (!userId) throw new Error("The account was created without a user ID.");

    const { firstName, lastName } = splitName(fullName);
    const colors = buildPlatformColors(value.content.brand_colors);
    let site;
    try {
      site = await createWebsite({
        templateId: design.templateId,
        userId,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerEmail: email,
        websiteName: value.business.name,
        ...colors
      });
    } catch (siteError) {
      try { await deleteUser(userId); } catch (cleanupError) { console.warn("Could not clean up user after site error:", cleanupError.message); }
      throw siteError;
    }

    const projectId = site?.projectId;
    const websiteId = site?.websiteId;
    if (!projectId) throw new Error("Your account was created, but the website project ID was missing.");

    let accessUrl = "";
    try {
      const buildingSession = await startBuildingSession({
        projectId,
        websiteId,
        userEmail: email,
        path: process.env.SIMVOLY_SSO_PATH || undefined
      });
      accessUrl = buildingSession?.accessUrl || buildingSession?.url || "";
    } catch (ssoError) {
      console.warn("SSO session could not be opened:", ssoError.message);
    }

    await sendLeadWebhook({
      type: "smart1-site-created",
      companyName: value.business.name,
      websiteUrl: value.business.sourceUrl,
      fullName,
      email,
      designKey: design.key,
      templateId: design.templateId,
      projectId,
      websiteId,
      brandColors: value.content.brand_colors,
      createdAt: new Date().toISOString()
    });

    previewSessions.delete(previewId);
    res.json({
      ok: true,
      accessUrl: accessUrl || "https://smart1sites.com/login",
      projectId,
      websiteId,
      sso: Boolean(accessUrl)
    });
  } catch (error) {
    console.error("Registration/site creation failed:", error);
    res.status(error.code === "SIMVOLY_NOT_CONFIGURED" ? 503 : 502).json({
      error: "We couldn't finish creating your Smart 1 Site. Your preview is still saved, so please try again."
    });
  }
});

const port = Number(process.env.PORT) || 10000;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Smart 1 Sites Creator listening on 0.0.0.0:${port}`);
});
server.keepAliveTimeout = 120_000;
server.headersTimeout = 120_000;
