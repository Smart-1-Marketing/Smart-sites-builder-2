# Smart 1 Sites Creator v2.1 deploy checklist

1. Commit these files to `Smart-1-Marketing/Smart-sites-builder-2`.
2. Keep Render as a **Node Web Service / Blueprint**, not Docker.
3. Keep the existing Render environment group `simvy keys` attached.
4. Confirm the group contains a usable Platform API key. Preferred names:
   - `SIMVOLY_API_BASE_URL=https://api.smart1sites.com`
   - `SIMVOLY_API_KEY=...`
5. Confirm `OPENAI_API_KEY` is available.
6. Health Check Path: `/health`.
7. Deploy `main`.

## Test 1 — The Farm

- Company: `The Farm RV Resort`
- Website: `https://thefarmrvresort.com/`
- Goal: Make a reservation

Verify:
- brand colors are the same across all four layouts
- hero and cards use real attractive photos, not logos/badges/text graphics
- no image is stretched
- each design changes layout but not branding
- Choose This Design opens Create Account
- registration creates the user/site and opens the returned builder SSO session

## Test 2 — Smart 1 Marketing

- Company: `Smart 1 Marketing`
- Website: `https://smart1marketing.com/`

Verify the same items above, especially that service cards do not use repeated/cropped Smart 1 logo art when better photo candidates exist.
