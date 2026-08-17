function cleanDomain(value = "") {
  return String(value).trim().replace(/^https?:\/\//i,"").replace(/^api\./i,"").replace(/\/+$/,"");
}

export function getSimvolyConfig() {
  const domain = cleanDomain(
    process.env.SIMVOLY_WL_DOMAIN ||
    process.env.SIMVY_WL_DOMAIN ||
    process.env.SIMVOLY_DOMAIN ||
    process.env.SIMVY_DOMAIN ||
    process.env.WL_DOMAIN || ""
  );
  const clientKey =
    process.env.SIMVOLY_CLIENT_KEY ||
    process.env.SIMVY_CLIENT_KEY ||
    process.env.SIMVOLY_API_KEY ||
    process.env.SIMVY_API_KEY ||
    process.env.WL_CLIENT_KEY || "";
  return { domain, clientKey, apiBase: domain ? `https://api.${domain}/api/v1` : "" };
}

async function simvolyFetch(path, options={}) {
  const {apiBase, clientKey, domain} = getSimvolyConfig();
  if (!domain || !clientKey) {
    const e = new Error("Simvoly credentials are not configured in the Render environment group.");
    e.code = "SIMVOLY_NOT_CONFIGURED";
    throw e;
  }
  const r = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {"X-CLIENT-KEY":clientKey, ...(options.headers||{})}
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const e = new Error(`Simvoly API returned ${r.status}`);
    e.status = r.status; e.details = data; throw e;
  }
  return data;
}

function normalizeTemplate(t) {
  return {
    id:Number(t.id),
    name:t.name || `Template ${t.id}`,
    primaryCategories:t.primaryCategories || "",
    categories:t.categories || "",
    visible:Boolean(t.visible),
    systemTemplate:Boolean(t.systemTemplate),
    previewUrl:t.previewUrl ? (String(t.previewUrl).startsWith("http") ? t.previewUrl : `https://${t.previewUrl}`) : "",
    thumb:t.thumb || ""
  };
}

export async function listWebsiteTemplates({visibleOnly=true}={}) {
  const raw = await simvolyFetch("/templates");
  const list = Array.isArray(raw) ? raw : (raw?.data || []);
  return list.map(normalizeTemplate).filter(t => !visibleOnly || t.visible);
}

export async function createWebsite(data={}) {
  const body = new URLSearchParams();
  for (const [k,v] of Object.entries(data)) {
    if (v === undefined || v === null || v === "") continue;
    body.set(k, k === "personalizationTags" && Array.isArray(v) ? JSON.stringify(v) : String(v));
  }
  return simvolyFetch("/website", {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body
  });
}
