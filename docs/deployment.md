# Deployment and operations

## Local development

Install dependencies, run `pnpm --filter @citadel/lyra db:migrate`, then `pnpm dev`. Default local demo mode uses real local D1/Workflow/Agent emulation and deterministic provider responses. A `.dev.vars` override enables live AI. Local auth bypass requires all three conditions: `APP_ENV=local`, `LOCAL_AUTH_BYPASS=true`, and a loopback request hostname. Do not expose the development server over a tunnel.

## Provision staging, then production

1. Authenticate Wrangler with `pnpm --filter @citadel/lyra exec wrangler login`.
2. Preview resource creation with `node scripts/provision.mjs staging`. Add `--apply` to create D1 and R2 and save the database ID. Resource names and bindings are separate per environment. If provisioning partially fails, finish the remaining commands manually; do not recreate an existing database.
3. Create an AI Gateway for the environment. Configure it to avoid request/response body logging and caching. Set `AI_GATEWAY_ACCOUNT_ID` and `AI_GATEWAY_ID` under the environment's `vars` in `apps/lyra/wrangler.jsonc`.
4. Create a Cloudflare Access self-hosted application for the chosen hostname, with an allow policy restricted to your email. Set `ACCESS_TEAM_DOMAIN` (for example `your-team.cloudflareaccess.com`, without a scheme), `ACCESS_AUD`, and `ALLOWED_EMAIL` in the same environment's vars. Worker JWT verification independently enforces issuer, audience, signature, expiry, and email.
5. Production targets **`lyra.dsilverdi.workers.dev`**: the production Worker is named `lyra` with `workers_dev: true`. Confirm the selected Cloudflare account's Workers subdomain is `dsilverdi`. Configure a Cloudflare Access self-hosted application for this exact hostname with an Allow → Emails policy for **`dsilverdi@gmail.com`**, then copy its team domain and application audience into the production vars. Access protection and the Worker's JWT checks remain required. Preview URLs stay disabled. Staging still requires its own hostname, for example `"routes": [{"pattern": "lyra-staging.example.com", "custom_domain": true}]`. The Worker authenticates API, SSR, asset, and Agent requests before routing; websocket paths also verify conversation ownership and browser origin.
6. Store credentials using these commands. Never put secrets in the committed vars object.

   ```bash
   pnpm --filter @citadel/lyra exec wrangler secret put OPENAI_API_KEY --env staging --config wrangler.jsonc
   pnpm --filter @citadel/lyra exec wrangler secret put AI_GATEWAY_TOKEN --env staging --config wrangler.jsonc
   ```

7. Run `pnpm check`, `pnpm --filter @citadel/lyra db:migrate:staging`, and `pnpm --filter @citadel/lyra deploy:staging`. Verify the approved research flow, reconnect, and cancellation using a real OpenAI request.
8. Repeat for production with its own resources, Access audience, Gateway, and secrets. Use `db:migrate:production` and `deploy:production`.

Deployment scripts select `CLOUDFLARE_ENV` at build time and deploy the resulting flattened configuration. Do not build the local configuration and then pass `--env` only to deployment; Cloudflare's Vite integration selects bindings during the build.

Install dependencies and commit `pnpm-lock.yaml` before a release. CI uses the frozen lockfile when present; its bootstrap path resolves the manifests when the initial lockfile has not yet been generated. Deployment is explicit; CI does not publish an app or provision billable resources automatically.

## Automatic production deployments from master

After provisioning, configuring Access/secrets, and verifying the first deployment manually, connect the existing `lyra` Worker to GitHub through **Settings → Build** in Cloudflare. Use Cloudflare Workers Builds with these settings:

| Setting                                | Value                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Repository                             | `dsilverdi/citadel`                                                                                  |
| Production branch                      | `master`                                                                                             |
| Root directory                         | Repository root (`/`)                                                                                |
| Build command                          | `pnpm install --frozen-lockfile && pnpm check`                                                       |
| Deploy command                         | `pnpm --filter @citadel/lyra db:migrate:production && pnpm --filter @citadel/lyra deploy:production` |
| Non-production branch / preview builds | Disabled initially                                                                                   |

The repository root is needed for shared workspace packages and the lockfile. The deployment script changes into Lyra's directory and selects the production Cloudflare environment before building. Its production build runs after validation; the default local build produced by `pnpm check` is never deployed by this script.

Commit the generated lockfile and actual non-secret environment configuration before connecting Builds. Use Node/pnpm versions matching `.node-version` and the root `packageManager` field. Ensure the Builds API token has **D1 edit** in addition to the Worker deployment permissions, because the deploy command applies database migrations. The OpenAI key and authenticated AI Gateway token are **Worker runtime secrets**, not build variables; retain them on the production Worker.

Changes to `master` now run validation, apply pending production migrations, and deploy Lyra. A failed build stops deployment; a successful migration is not rolled back if deployment later fails, so keep migrations backward compatible. GitHub Actions separately checks `master` and pull requests, but Workers Builds does not wait for that separate workflow: the build command runs its own checks. Run the Playwright suite against staging before merging production changes, or require it through branch protection.

For future apps, connect each Worker to the same monorepo with its own commands and build watch paths. Include the app directory, shared packages, root workspace/lockfile/configuration, and deployment scripts in its watch paths. Do not enable preview builds against production bindings; use the separate staging environment first.

References: [Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [monorepos and environments](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/), [Vite environment selection](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/).

## Monitoring and recovery

- Inspect Workers logs and Workflow status in Cloudflare. Application logs include exception names only, not prompts or provider response bodies.
- AI Gateway supplies provider request metrics. Disable body logging in the Gateway configuration as well as the application request headers.
- Check D1 runs stuck in `queued`, `running`, or `uncertain`. The five-minute cron redispatches queued jobs and reconciles deadlines/cancellation. It never reissues an unconfirmed provider submission.
- For an `uncertain` run, inspect provider usage before cancelling it in the UI and starting a replacement. An unconfirmed request may still be running or billable, even if Lyra never received its ID.
- Update curated model capabilities in `packages/ai/src/models.ts` when changing models. Verify project access, background execution, web search, and supported effort values with a staging smoke test. Unsupported access fails visibly; Lyra never silently switches models.
- Set `MODEL_PRICING_JSON` to current rates to enable estimates. Search content tokens may incur model charges in addition to search-call charges. Estimates exclude platform storage/compute charges.
- Use D1 Time Travel for database recovery and Cloudflare deployment rollback for code rollback. Keep schema changes backward compatible so a code rollback can still use the database. Export reports from R2 before removing an environment.

## Data and authentication

OpenAI calls set `store=true` for durable retrieval, which uses provider-side retention. History and source records persist in D1; reports persist in private R2. There is no public report URL. Report downloads require the same authenticated owner as the conversation. Account-wide data deletion/retention automation is outside v1; manage these resources explicitly in Cloudflare and review OpenAI data settings.
