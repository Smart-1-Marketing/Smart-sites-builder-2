# Smart 1 Sites Creator v2

Consumer-facing website makeover flow.

## What changed

1. Existing website URL is required.
2. The backend actually crawls the current public website (homepage + a small set of useful same-domain pages).
3. It extracts real copy, headings, CTAs, logo candidates, images, phone/email and important pages.
4. OpenAI reorganizes and improves only grounded source content; it is instructed not to invent claims.
5. The Simvoly White Label API supplies live template candidates when configured.
6. Screen 2 ALWAYS shows four clickable visual design directions immediately, even if the live template catalog is temporarily unavailable.
7. Each design renders the customer's real content and photos into a full scrollable homepage preview.
8. All navigation / selection / back / continue buttons are wired.
9. Render binds to 0.0.0.0:$PORT and uses /health.

## Render

Use the included render.yaml as a Node web service Blueprint. It references the existing environment group `simvy keys`.

## Test case

Website: https://thefarmrvresort.com/
Goal: Make a reservation

The preview should use real Farm RV Resort material (for example their real imagery, reservation intent, campground/amenity content) rather than generic service cards.
