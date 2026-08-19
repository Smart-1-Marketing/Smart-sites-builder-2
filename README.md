# Smart 1 Sites Creator v2.1

Consumer-facing AI website makeover for Smart 1 Sites.

## What changed in v2.1

### Company name is required

Screen 1 asks for both the company name and current website. The customer-entered company name is treated as the source of truth in the preview and created site.

### Brand colors stay consistent

The crawler now scans:

- `theme-color`
- inline styles
- CSS variables such as brand / primary / accent colors
- up to five public stylesheets

It scores the non-neutral colors and builds a brand palette. Every design option uses the **same detected brand palette**. Only layout/presentation changes. The selected primary/secondary colors are also passed to the Smart 1 Sites Platform API when the real site is created.

### Better images, no stretched graphics

Image selection now:

- prioritizes real photo/hero/background candidates
- considers width, height and aspect ratio when available
- penalizes logos, icons, badges, awards, screenshots, charts, diagrams and text-heavy graphics
- reads CSS background images in addition to `<img>` tags
- gives OpenAI up to eight top image candidates as low-detail visual inputs so it can prefer attractive photography
- retries text-only if a remote image cannot be read
- prevents the same image from being reused across hero/features/story/gallery when alternatives exist
- renders all images with `object-fit: cover` rather than stretching them

### Signup happens inside this wizard

The old Smart 1 Sites wizard does not simply send the customer to `/website-wizard`; after a design is chosen it shows **Create Account** with name, email and password. This build now follows that same customer journey directly.

After the customer chooses a design:

1. Screen 3 asks for name, email and password.
2. `POST /api/v1/users` creates the Smart 1 Sites user.
3. `POST /api/v1/website` creates the website with the chosen live template ID and detected brand colors.
4. `POST /api/platform/session` opens a white-label SSO builder session using the created project/site.
5. The browser redirects to the returned `accessUrl`.

Existing accounts are not silently modified. If the email already exists, the customer is sent to the Smart 1 Sites login page.

## Customer flow

### 1 — Your business
Required:
- Company name
- Current website

Optional:
- Primary customer action
- Business type

### 2 — New designs
- Four visual layouts
- Same company name, content and brand colors in every option
- Real website photography
- Full scrolling homepage preview
- Current-site comparison

### 3 — Create account
- Name
- Email
- Password
- Terms acceptance
- Creates user + site + builder SSO session

## Render

Use the existing `render.yaml` and existing Render environment group:

```text
simvy keys
```

Health check:

```text
/health
```

The server binds to `0.0.0.0:$PORT`.

## Required environment values

OpenAI:

```text
OPENAI_API_KEY
```

Smart 1 Sites Platform API (preferred names):

```text
SIMVOLY_API_BASE_URL=https://api.smart1sites.com
SIMVOLY_API_KEY=<platform api key>
```

The older aliases such as `SIMVOLY_WL_DOMAIN` and `SIMVOLY_CLIENT_KEY` still work.

## Security notes

- Platform/API keys remain server-side.
- Account passwords are sent only to the Smart 1 Sites user-creation endpoint and are never stored by this app or included in lead webhooks.
- Crawler blocks localhost/private/link-local IP destinations.
- Crawl size/page count/timeouts are bounded.
- Preview selection is stored server-side with a temporary opaque preview ID so the browser cannot substitute a different template or brand color during signup.

## v2.2 theme-selection correction

The four design choices are now based on the **actual top-ranked Smart 1 / Simvoly templates**, not four color presets.

- Design cards use Simvoly's real `thumb` image when available.
- Design names come from the actual Simvoly `name` field.
- The customer can open the real `previewUrl` with **View Original Theme**.
- The personalized large preview keeps the same detected company brand palette for every option.
- Each of the four personalized previews now uses a materially different DOM/layout structure: split, immersive, editorial, and stacked conversion.
- The selected live `templateId` is still the value used when the account/site is created.
- `GET /api/templates` exposes the live normalized catalog for internal review/export tooling.

This separation is intentional: the real theme thumbnail shows the customer the original Smart 1 design language, while the personalized preview shows how their own content and brand can work in that theme direction.
