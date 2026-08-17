# Smart 1 Sites Creator

This build uses the **live Simvoly White Label template API** instead of hard-coded theme IDs.

## Simvoly template endpoint

`GET https://api.<white-label-domain>/api/v1/templates`

Header:

`X-CLIENT-KEY: <client key>`

The app uses template ID, name, categories, visibility, custom/system status, preview URL, and thumbnail.

## What changed

- Pulls visible Smart 1 / Simvoly templates live.
- Scores those templates against the business type and goal.
- Gives the top live candidates to OpenAI.
- Hard-guards the AI so it can only pick an actual returned template ID.
- Prefers Smart 1 custom templates when relevance is comparable.
- Opens the actual live `previewUrl` inside the wizard.
- Records the Simvoly thumbnail for every template the customer views.
- Marks and retains the final selected template visually.
- Adds `/api/simvoly/create-site` using Simvoly's create-project/site endpoint.
- Keeps API credentials server-side.
- `render.yaml` links the existing Render environment group named `simvy keys`.

## Supported environment variable aliases

Domain:
- `SIMVOLY_WL_DOMAIN`
- `SIMVY_WL_DOMAIN`
- `SIMVOLY_DOMAIN`
- `SIMVY_DOMAIN`
- `WL_DOMAIN`

Client key:
- `SIMVOLY_CLIENT_KEY`
- `SIMVY_CLIENT_KEY`
- `SIMVOLY_API_KEY`
- `SIMVY_API_KEY`
- `WL_CLIENT_KEY`

## Render

Build: `npm install`

Start: `npm start`

The service name is `smart-1-sites-creator` and the Blueprint references:

`fromGroup: "simvy keys"`

## Endpoints

- `GET /api/health`
- `GET /api/templates`
- `POST /api/site-plan`
- `POST /api/simvoly/create-site`

The create-site route accepts Simvoly's normal fields such as `templateId`, `externalCustomerId` or `userId`, customer name/email, subdomain, website name, brand colors, and personalization tags.
