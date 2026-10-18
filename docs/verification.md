# Verification

Checked on 2026-10-17 after installing the repository's declared dependencies, using Node 24.22.0:

- Formatting and ESLint passed with zero lint warnings.
- Full TypeScript checks passed for auth, AI, UI, and Lyra packages, including the Playwright test sources.
- React Router route type generation passed.
- All 21 unit tests passed across contracts, citations, response parsing, authentication boundaries, database constraints, and PWA offline behavior.
- The production client and Cloudflare Worker SSR builds passed. Vite explicitly writes to `build/client` and `build/server`, matching React Router's manifest paths and Wrangler's asset binding.
- The supplied logo and six binary favicon files were verified byte for byte against the originals; manifest icon paths and sizes are covered by tests.

The installed build emits upstream Zod annotation notices and React Router future-flag warnings; these do not fail the build. Earlier checks used temporary cached tooling while dependencies were unavailable; the results above supersede those checks.

Local Cloudflare integration, desktop/mobile Playwright execution, and installation on real phones remain unverified because the sandbox blocks local server sockets and Chromium launch. See [PWA verification steps](pwa.md). Production D1 (`lyra-production`), private R2 (`lyra-production-reports`), AI Gateway (`lyra-production`), and an email-restricted Access application have been provisioned. No live OpenAI requests were sent. On 2026-10-18, migration `0001_initial.sql` was applied remotely and Worker version `18729eb3-3676-4f3e-9fcc-dc64f54c44f5` was published at https://lyra.dsilverdi.workers.dev, including its research Workflow and five-minute cron. An unauthenticated HTTPS request returned a 302 redirect to Cloudflare Access with the configured application audience. Both `OPENAI_API_KEY` and `AI_GATEWAY_TOKEN` were confirmed present as Worker secrets without reading their values. Authenticated UI and live AI requests remain unverified.

Run the declared toolchain before release:

```bash
pnpm install
pnpm check
pnpm --filter @citadel/lyra db:migrate
pnpm --filter @citadel/lyra exec playwright install chromium
pnpm test:e2e
```

Commit the generated lockfile. Then provision staging and perform a real OpenAI smoke test following [deployment.md](deployment.md).

## Light UI refresh — 2026-10-18

Replaced the dark cyan surfaces, suggestion cards, glow, and decorative copy with a neutral light theme, compact composer, and a bottom sheet for conversation mode and model settings. PWA theme/launch colors and the offline page now match; offline cache version is v2 so installed clients replace the old offline screen.

Formatting, ESLint, Lyra and shared UI TypeScript checks, all 21 unit tests, all 10 desktop/mobile Playwright tests, and the production client/Worker build passed. Playwright used the installed Chromium headless shell with a temporary config against the real local Cloudflare demo server. Research approval, history after reload, chat/revision, cancellation, source viewing, and install prompt/fallback flows were exercised. Desktop, phone, and options-sheet screenshots were visually reviewed. Physical phone installation remains unverified. No live OpenAI requests were made. The light UI from commit `9a9decd` was deployed on 2026-10-18 as Worker version `fd30f135-1edb-4f5e-bbd9-aa8b752c552a`. Both required runtime secrets were confirmed present and no D1 migrations were pending. The live URL returned HTTP 302 to the configured Cloudflare Access login. Authenticated production UI, updated manifest/service-worker delivery, and physical phone installation still need a signed-in device check.

## Portrait branding — 2026-10-18

Replaced the shared/public logo and six favicon binaries with the supplied Lyra portrait and `favicon_lyra` set. Binary comparisons confirmed the logo and icons match their supplied originals. Preserved the app manifest's stable identity and light theme; icon URLs use version 3 and the offline cache is v3. The supplied welcome artwork is preserved in shared assets and compressed to a 393 KB WebP for display at 6% opacity only behind an empty conversation.

Formatting, ESLint, Lyra TypeScript, all 21 unit tests, and all 10 desktop/mobile browser tests passed. Phone and desktop welcome screenshots were visually checked. The production client/Worker build passed. Commit `fe22f63` was published as Worker version `89dd84c0-efad-41c9-ae33-8ba77a80d621`. No migrations were pending; both runtime secrets remain configured. The production URL returned HTTP 302 to the configured Cloudflare Access login. Authenticated production asset delivery and existing home-screen icon updates remain a signed-in device check. No live OpenAI calls were made.

## Full welcome background — 2026-10-18

Moved welcome artwork to the full initial-page background at 10% opacity, covering the header, navigation, and bottom spacing. The composer remains opaque, and conversations with messages retain their plain background. A phone-browser check confirmed artwork bounds of 390 × 844 pixels and computed opacity 0.1; the screenshot was visually reviewed.

Formatting, ESLint, TypeScript, 21 unit tests, 10 desktop/mobile browser tests, and the production build passed. Required secrets were present and D1 had no pending migrations. Published as Worker version `b335f948-8916-4127-b72d-ab898b84ed32`. The live URL returned HTTP 302 to the expected Cloudflare Access login. Signed-in production appearance remains a device check. This release includes working-tree UI changes.

## Welcome opacity and solid navigation — 2026-10-18

Increased the welcome artwork to 20% opacity across the initial page. Desktop sidebar uses an opaque neutral surface; the mobile drawer remains opaque white. The composer is also opaque. Browser inspection confirmed opacity 0.2, sidebar background `rgb(240, 241, 239)`, and drawer background `rgb(255, 255, 255)`.

Formatting, ESLint, TypeScript, 21 unit tests, 10 desktop/mobile browser tests, and production build passed. Both runtime secrets remain configured and no D1 migrations were pending. Deployed as Worker version `460b5702-cb1b-420d-8161-3ca7ca90b54b`; the live URL returned HTTP 302 to the configured Access login. Authenticated production appearance remains a signed-in device check.

## Research planning rejection investigation — 2026-10-18

Read-only production run/step metadata and Workflow diagnostics show two plan submissions rejected before a response ID or search step, across Astra and Luna. A normal Astra chat completed. Workflow diagnostics recorded an outer `Error` with a message prefixed `ProviderRejected`, proving that the old handler's class/name checks lost the actionable rejection at the Workflow step boundary. Original HTTP status/code/parameter details were not retained; the precise upstream rejection cannot be recovered from those records.

The local patch returns confirmed submission rejections as persisted step data and raises the typed application error outside the Workflow boundary. Messages retain only validated HTTP status, provider code, parameter path, and request ID, never raw provider messages or prompts. Planning now uses strict Structured Outputs instead of legacy JSON mode. The request-format change is a mitigation for a planning-specific rejection, not a confirmed diagnosis of the missing upstream error. No model was changed and ambiguous paid submissions are not retried automatically; old successful Workflow response-ID strings remain replayable.

New tests exercise the real OpenAI SDK against mocked HTTP/SSE responses, JSON-persisted rejection results, redaction, non-retry behavior, missing response IDs, and older history replay. All 31 unit tests, TypeScript, lint, formatting, and client/Worker build passed. All 10 desktop/mobile browser tests also passed against local demo mode; those tests do not exercise live provider compatibility. No live provider calls were made during validation. The patch was deployed as Worker version `abd15c6a-66ba-43a0-8b6b-292f841e7b93` on 2026-10-18 after a production build and bindings check. No migrations were pending and both runtime secrets were present. The live URL returned HTTP 302 to the configured Access login. A signed-in live planning request is still required to confirm resolution.

## Conversation deletion — 2026-10-18

Added a history-row trash action and confirmation sheet, owner-scoped DELETE endpoint, atomic busy/provider-state checks, cascading record deletion, and durable R2 report cleanup. Migration `0002_conversation_deletions.sql` was applied locally only; the existing five-minute cron retries report cleanup jobs. No production conversations or reports were removed.

All 40 unit tests pass, including ownership, active and unresolved requests, child-record cascades, report pagination, and cleanup retry. All 12 desktop/mobile browser scenarios pass (the 10 existing scenarios plus deletion on both devices); the deletion tests verify cancellation of the confirmation, successful deletion, reload persistence, 403 for cross-origin DELETE, and 404 for missing chats. Formatting, lint, TypeScript, and client/Worker build passed. The feature remains local; its migration must precede production publication.

## Interactive research clarification — 2026-10-18

The planner can request one to three tailored scope questions with two to four options, an explicit recommendation, and a custom-answer path. A responsive popup presents one question at a time, preserves selections during Back/Continue and closing, and restores persisted pending questions after a reload. Submitted answers become a user message and a new planning run with the original model/effort. Plan approval remains separate. A sufficiently detailed brief can skip clarification. Unsubmitted answer drafts are not persisted across reloads.

Migration `0003_research_clarifications.sql` was applied locally only. All 43 unit tests pass, including question validation, recommended-option bounds, complete/unique answer IDs, and deletion cascades. All 14 desktop/mobile browser scenarios pass; coverage verifies reopening questions, recommendations and custom text, back navigation, plan creation, settings preservation, duplicate submission, and stale/invalid answer rejection. Desktop and phone popup screenshots were visually reviewed. Formatting, lint, TypeScript, and the production client/Worker build passed. Browser tests use deterministic local demo responses; no live AI calls were made. Live model question quality and a signed-in production flow remain unverified. This feature has not been deployed; migrations `0002` and `0003` must precede publication.

## Clarification and deletion production release — 2026-10-18

Applied migrations `0002_conversation_deletions.sql` and `0003_research_clarifications.sql` to `lyra-production`; the final remote check confirms no pending migrations. `pnpm check` passed, including formatting, lint, all workspace typechecks, 43 unit tests, and client/Worker build. The 14 desktop/mobile browser scenarios passed during feature validation. A separate production build was checked against source bindings and resolved paths; local auth bypass and mock AI are absent. Both required runtime secrets remain configured.

Published Worker version `1fa40deb-610d-4f13-ad3f-7e9718897913` at https://lyra.dsilverdi.workers.dev with the production research Workflow and five-minute cron. HTTPS returns HTTP 302 to `dsilverdi.cloudflareaccess.com`. Signed-in production clarification, live model question quality, and deletion remain a user smoke test; no live OpenAI requests or production conversation deletions were performed during release verification.
