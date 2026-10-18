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
