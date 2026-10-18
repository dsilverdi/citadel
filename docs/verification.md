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
