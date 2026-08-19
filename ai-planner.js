const CTA_LABELS = {
  reservation: "Reserve Now",
  online_order: "Order Online",
  appointment: "Book an Appointment",
  quote: "Request a Quote",
  call: "Call Now",
  lead: "Contact Us"
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    business_name: { type: "string" },
    industry: { type: "string" },
    location: { type: "string" },
    tagline: { type: "string" },
    primary_cta: {
      type: "object", additionalProperties: false,
      properties: { label: { type: "string" }, url: { type: "string" } },
      required: ["label", "url"]
    },
    secondary_cta: {
      type: "object", additionalProperties: false,
      properties: { label: { type: "string" }, url: { type: "string" } },
      required: ["label", "url"]
    },
    hero: {
      type: "object", additionalProperties: false,
      properties: {
        eyebrow: { type: "string" },
        headline: { type: "string" },
        subheadline: { type: "string" },
        image_url: { type: "string" }
      },
      required: ["eyebrow", "headline", "subheadline", "image_url"]
    },
    nav: {
      type: "array", maxItems: 6,
      items: {
        type: "object", additionalProperties: false,
        properties: { label: { type: "string" }, url: { type: "string" } },
        required: ["label", "url"]
      }
    },
    stats: {
      type: "array", maxItems: 4,
      items: {
        type: "object", additionalProperties: false,
        properties: { value: { type: "string" }, label: { type: "string" } },
        required: ["value", "label"]
      }
    },
    feature_heading: { type: "string" },
    features: {
      type: "array", minItems: 3, maxItems: 6,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          image_url: { type: "string" },
          link_url: { type: "string" }
        },
        required: ["title", "body", "image_url", "link_url"]
      }
    },
    story: {
      type: "object", additionalProperties: false,
      properties: { heading: { type: "string" }, body: { type: "string" }, image_url: { type: "string" } },
      required: ["heading", "body", "image_url"]
    },
    gallery_heading: { type: "string" },
    gallery: { type: "array", maxItems: 6, items: { type: "string" } },
    faqs: {
      type: "array", maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        properties: { question: { type: "string" }, answer: { type: "string" } },
        required: ["question", "answer"]
      }
    },
    phone: { type: "string" },
    email: { type: "string" },
    selected_template_id: { type: "integer" },
    alternative_template_ids: { type: "array", maxItems: 5, items: { type: "integer" } }
  },
  required: [
    "business_name", "industry", "location", "tagline", "primary_cta", "secondary_cta",
    "hero", "nav", "stats", "feature_heading", "features", "story", "gallery_heading",
    "gallery", "faqs", "phone", "email", "selected_template_id", "alternative_template_ids"
  ]
};

function inferredBusinessName(crawl) {
  const value = crawl.siteName || crawl.headings?.[0] || crawl.title || crawl.domain;
  return String(value).split(/\s+[|–—-]\s+/)[0].trim().slice(0, 80);
}

function chooseCta(crawl, goal) {
  const patterns = {
    reservation: /(reserve|book|plan your stay)/i,
    online_order: /(order|shop|buy)/i,
    appointment: /(appointment|schedule|book)/i,
    quote: /(quote|estimate)/i,
    call: /call/i,
    lead: /(contact|get started|learn more|discovery)/i
  };
  const match = crawl.ctas?.find(x => patterns[goal]?.test(x.text)) || crawl.ctas?.[0];
  return {
    label: match?.text?.slice(0, 35) || CTA_LABELS[goal] || "Get Started",
    url: match?.url || crawl.finalUrl
  };
}

function featureFallback(crawl) {
  const images = crawl.images || [];
  const headings = (crawl.headings || []).filter(h => h.length >= 5 && h.length < 90).slice(1, 7);
  const paragraphs = crawl.paragraphs || [];
  return (headings.length >= 3 ? headings : ["What We Offer", "Why Customers Choose Us", "Learn More"]).slice(0, 6).map((title, index) => ({
    title,
    body: (paragraphs.find(p => p.toLowerCase().includes(title.split(" ")[0].toLowerCase())) || paragraphs[index] || "").slice(0, 190),
    image_url: images[index + 1]?.url || "",
    link_url: crawl.finalUrl
  }));
}

export function fallbackPlan(crawl, input, templates = []) {
  const name = input.companyName || inferredBusinessName(crawl);
  const primary = chooseCta(crawl, input.primaryGoal || "lead");
  const heroImage = crawl.images?.[0]?.url || "";
  const sourceHeadline = crawl.headings?.find(h => h.length >= 12 && h.length <= 100) || name;
  return {
    business_name: name,
    industry: input.businessType || "Local Business",
    location: input.city || "",
    tagline: crawl.headings?.[1] || "",
    primary_cta: primary,
    secondary_cta: { label: "Learn More", url: crawl.finalUrl },
    hero: {
      eyebrow: crawl.headings?.[1] || `Welcome to ${name}`,
      headline: sourceHeadline,
      subheadline: (crawl.metaDescription || crawl.paragraphs?.[0] || "").slice(0, 230),
      image_url: heroImage
    },
    nav: (crawl.pages || []).slice(0, 5).map((page, index) => ({
      label: index === 0 ? "Home" : (page.title.split(/\s+[|–—-]\s+/)[0] || `Page ${index + 1}`).slice(0, 30),
      url: page.url
    })),
    stats: [],
    feature_heading: `Explore ${name}`,
    features: featureFallback(crawl),
    story: {
      heading: crawl.headings?.[3] || `About ${name}`,
      body: (crawl.paragraphs?.[2] || crawl.paragraphs?.[0] || "").slice(0, 520),
      image_url: crawl.images?.[7]?.url || crawl.images?.[1]?.url || ""
    },
    gallery_heading: `See ${name}`,
    gallery: (crawl.images || []).slice(0, 6).map(x => x.url),
    faqs: [],
    phone: crawl.phones?.[0] || "",
    email: crawl.emails?.[0] || "",
    selected_template_id: templates[0]?.id || 0,
    alternative_template_ids: templates.slice(1, 6).map(x => x.id)
  };
}

function validateLinks(plan, crawl) {
  const links = new Set((crawl.links || []).filter(x => /^https?:/i.test(x.url)).map(x => x.url));
  links.add(crawl.finalUrl);
  const safeLink = value => links.has(value) ? value : crawl.finalUrl;
  plan.primary_cta.url = safeLink(plan.primary_cta.url);
  plan.secondary_cta.url = safeLink(plan.secondary_cta.url);
  plan.nav = (plan.nav || []).map(item => ({ ...item, url: safeLink(item.url) }));
  plan.features = (plan.features || []).map(item => ({ ...item, link_url: safeLink(item.link_url) }));
  return plan;
}

function assignQualityImages(plan, crawl) {
  const candidates = (crawl.images || []).map(x => x.url).filter(Boolean);
  const allowed = new Set(candidates);
  const used = new Set();

  const pick = requested => {
    if (requested && allowed.has(requested) && !used.has(requested)) {
      used.add(requested);
      return requested;
    }
    const next = candidates.find(url => !used.has(url));
    if (next) used.add(next);
    return next || "";
  };

  plan.hero.image_url = pick(plan.hero?.image_url);
  plan.features = (plan.features || []).map(feature => ({ ...feature, image_url: pick(feature.image_url) }));
  plan.story.image_url = pick(plan.story?.image_url);
  plan.gallery = (plan.gallery || []).filter(url => allowed.has(url) && !used.has(url)).slice(0, 6);
  plan.gallery.forEach(url => used.add(url));
  if (plan.gallery.length < 3) {
    for (const url of candidates) {
      if (plan.gallery.length >= 6) break;
      if (!used.has(url)) {
        plan.gallery.push(url);
        used.add(url);
      }
    }
  }
  return plan;
}

function finalValidate(plan, crawl, input) {
  plan.business_name = input.companyName || plan.business_name || inferredBusinessName(crawl);
  plan = validateLinks(plan, crawl);
  plan = assignQualityImages(plan, crawl);
  return plan;
}

function buildPrompt(crawl, input, candidates) {
  const imageMetadata = (crawl.images || []).map((image, index) =>
    `${index + 1}. ${image.url} | alt=${JSON.stringify(image.alt || "")} | source=${image.source || "unknown"} | score=${image.score ?? 0}`
  ).join("\n");

  return `You are the Smart 1 Sites redesign engine.

A business owner supplied their CURRENT WEBSITE. Create a stronger consumer-facing homepage preview using their real public content and brand.

COMPANY NAME (REQUIRED CUSTOMER INPUT): ${input.companyName}
Use this exact company name in the redesigned site, even if the old website title differs.

NON-NEGOTIABLE RULES:
- Preserve the existing company's brand identity. Do not invent a different color scheme. Brand colors are applied separately by the renderer from the scanned site.
- Use only facts grounded in the supplied crawl.
- Reuse the business's real offers, services/amenities, location, CTAs and public content.
- Improve organization and wording, but do not fabricate awards, prices, review counts, certifications, years in business, guarantees, amenities, statistics or claims.
- Feature cards must be specific to this business. Never use generic filler such as “Our Services”, “Easy Next Steps”, or “Built on Trust” unless the source genuinely supports that wording.
- Choose images that are visually attractive PHOTOGRAPHS or strong environmental/product photos when available.
- Avoid logos, badges, screenshots, charts, text-heavy graphics, awards, partner marks and illustrations for hero/features when a real photo is available.
- Do not reuse the same image in multiple major sections when alternatives exist.
- image_url values MUST be exact URLs from ALLOWED IMAGE CANDIDATES.
- CTA/nav/link URLs MUST be exact URLs from ALLOWED LINK URLS.
- Pick a template id only from TEMPLATE CANDIDATES; if none exist use 0.
- Keep copy concise enough for a polished visual homepage.

CUSTOMER INPUT:
${JSON.stringify(input, null, 2)}

CURRENT WEBSITE CONTENT:
${crawl.combinedText}

ALLOWED IMAGE CANDIDATES:
${imageMetadata}

ALLOWED LINK URLS:
${(crawl.links || []).filter(x => /^https?:/i.test(x.url)).map(x => `${x.text} :: ${x.url}`).join("\n")}

TEMPLATE CANDIDATES:
${JSON.stringify(candidates, null, 2)}`;
}

async function createResponse(client, model, prompt, imageUrls, withVision) {
  const input = withVision && imageUrls.length
    ? [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...imageUrls.flatMap((url, index) => [
            { type: "input_text", text: `Visual candidate ${index + 1}: ${url}` },
            { type: "input_image", image_url: url, detail: "low" }
          ])
        ]
      }]
    : prompt;

  return client.responses.create({
    model,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "smart1_visual_site_plan",
        strict: true,
        schema
      }
    }
  });
}

export async function buildPlan({ client, model, crawl, input, templates }) {
  const fallback = fallbackPlan(crawl, input, templates);
  if (!client) return { plan: finalValidate(fallback, crawl, input), mode: "site-fallback" };

  const candidates = templates.slice(0, 12).map(template => ({
    id: template.id,
    name: template.name,
    primaryCategories: template.primaryCategories,
    categories: template.categories,
    systemTemplate: template.systemTemplate
  }));
  const prompt = buildPrompt(crawl, input, candidates);
  const visionImages = (crawl.images || []).slice(0, 8).map(x => x.url).filter(Boolean);

  let response;
  try {
    try {
      response = await createResponse(client, model, prompt, visionImages, true);
    } catch (visionError) {
      console.warn("Image-aware planning failed; retrying text-only:", visionError.message);
      response = await createResponse(client, model, prompt, [], false);
    }

    const plan = finalValidate(JSON.parse(response.output_text), crawl, input);
    const allowedIds = new Set(templates.map(t => t.id));
    if (!allowedIds.has(plan.selected_template_id)) plan.selected_template_id = templates[0]?.id || 0;
    plan.alternative_template_ids = (plan.alternative_template_ids || [])
      .filter(id => allowedIds.has(id) && id !== plan.selected_template_id)
      .slice(0, 5);
    return { plan, mode: visionImages.length ? "ai-vision" : "ai" };
  } catch (error) {
    console.error("AI planning fallback:", error.message);
    return { plan: finalValidate(fallback, crawl, input), mode: "site-fallback" };
  }
}
