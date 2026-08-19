const USER_AGENT = "Smart1SitesCreator/2.1 (+https://smart1sites.com)";

function cleanDomain(value = "") {
  return String(value).trim().replace(/^https?:\/\//i, "").replace(/^api\./i, "").replace(/\/+$/, "");
}

function cleanBase(value = "") {
  return String(value).trim().replace(/\/+$/, "");
}

export function getSimvolyConfig() {
  const explicitBase = cleanBase(process.env.SIMVOLY_API_BASE_URL || "");
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
  const platformKey = process.env.SIMVOLY_API_KEY || process.env.SIMVY_API_KEY || clientKey;
  return {
    domain,
    clientKey,
    platformKey,
    apiBase: explicitBase || (domain ? `https://api.${domain}` : "")
  };
}

function unwrapData(payload) {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload;
}

async function request(path, { method = "GET", form, query, sso = false } = {}) {
  const { apiBase, clientKey, platformKey } = getSimvolyConfig();
  const key = sso ? platformKey : clientKey;
  if (!apiBase || !key) {
    const error = new Error("Smart 1 Sites platform API is not configured.");
    error.code = "SIMVOLY_NOT_CONFIGURED";
    throw error;
  }

  const url = new URL(`${apiBase}${path}`);
  for (const [name, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
  }

  const headers = {
    "Accept": "application/json",
    "User-Agent": USER_AGENT,
    ...(sso ? { "Authorization": `Bearer ${key}` } : { "X-CLIENT-KEY": key })
  };
  let body;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams();
    for (const [name, value] of Object.entries(form)) {
      if (value === undefined || value === null || value === "") continue;
      body.set(name, Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(20_000)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  if (!response.ok) {
    const error = new Error(`Smart 1 Sites platform returned ${response.status}.`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function normalizeTemplate(template) {
  return {
    id: Number(template.id),
    name: template.name || `Template ${template.id}`,
    primaryCategories: template.primaryCategories || "",
    categories: template.categories || "",
    visible: Boolean(template.visible),
    systemTemplate: Boolean(template.systemTemplate),
    previewUrl: template.previewUrl
      ? (String(template.previewUrl).startsWith("http") ? template.previewUrl : `https://${template.previewUrl}`)
      : "",
    thumb: template.thumb || ""
  };
}

export async function listWebsiteTemplates({ visibleOnly = true } = {}) {
  const raw = await request("/api/v1/templates");
  const list = unwrapData(raw);
  if (!Array.isArray(list)) throw new Error("Template catalog did not return a list.");
  return list.map(normalizeTemplate).filter(template => !visibleOnly || template.visible);
}

export async function createUser({ name, email, password, locale = "en" }) {
  const raw = await request("/api/v1/users", {
    method: "POST",
    form: { name, email, password, locale }
  });
  return unwrapData(raw);
}

export async function searchUser(email) {
  const raw = await request("/api/v1/users/search", {
    method: "POST",
    form: { email }
  });
  return unwrapData(raw);
}

export async function deleteUser(userId) {
  return request(`/api/v1/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function createWebsite(values = {}) {
  const form = {
    templateId: values.templateId,
    funnelTemplateId: values.funnelTemplateId,
    externalCustomerId: values.externalCustomerId,
    userId: values.userId,
    customerFirstName: values.customerFirstName,
    customerLastName: values.customerLastName,
    customerEmail: values.customerEmail,
    customerSubdomain: values.customerSubdomain,
    websiteName: values.websiteName,
    brandColor: values.brandColor,
    secondaryColor1: values.secondaryColor1,
    secondaryColor2: values.secondaryColor2,
    secondaryColor3: values.secondaryColor3,
    secondaryColor4: values.secondaryColor4,
    personalizationTags: values.personalizationTags
  };
  const raw = await request("/api/v1/website", { method: "POST", form });
  return unwrapData(raw);
}

export async function startBuildingSession({ projectId, websiteId, userEmail, userId, externalCustomerId, path }) {
  const form = { projectId };
  if (websiteId) form.websiteId = websiteId;
  if (userEmail) form.userEmail = userEmail;
  else if (userId) form.userId = userId;
  else if (externalCustomerId) form.externalCustomerId = externalCustomerId;
  else throw new Error("A customer identifier is required to open the builder.");
  if (path) form.path = path;

  const raw = await request("/api/platform/session", { method: "POST", form, sso: true });
  return unwrapData(raw);
}
