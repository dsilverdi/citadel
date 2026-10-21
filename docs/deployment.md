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

## Conversation deletion

Apply `0002_conversation_deletions.sql` before deploying the deletion feature. The owner-only, same-origin `DELETE /api/conversations/:id` route atomically checks for active/unconfirmed requests, enqueues report cleanup, and deletes the conversation. Existing foreign-key cascades remove its messages, runs, plans, steps, and events. A concurrent send either blocks deletion with an active run or fails its parent foreign-key constraint; deleted data cannot be recreated by that submission.

R2 reports are cleaned from the exact `reports/<conversation-id>/` prefix immediately after the response. The existing five-minute cron retries pending `conversation_deletions` jobs if storage fails or background work is interrupted. This queue contains only the deleted conversation ID and timestamp; completed jobs are removed. Do not truncate it while cleanup is pending. An unresolved provider submission or pending cancellation blocks deletion until reconciled.

Deleting a chat removes its application history and private R2 exports. Provider-side OpenAI response retention, existing Cloudflare Workflow execution history, and database backups follow their separate retention policies.

## Research scope questions

Apply `0003_research_clarifications.sql` before publishing the clarification feature (and `0002_conversation_deletions.sql` if not already applied). Pending questions and submitted answers persist in D1 and cascade with conversation deletion. The owner-only, same-origin `POST /api/conversations/:id/clarifications/:id/answer` route requires one answer per question, accepts custom text, rejects replaced questions, and uses a stable submission ID to avoid duplicate planning runs. Answers preserve the original model/effort and create another planning run, never an approved research run. Closing the popup preserves the pending questions; unsubmitted selections are held in the current page only.

For a signed-in smoke test, submit a broad research brief, choose a recommendation and a custom answer, then confirm the resulting plan reflects those choices before approving research. Also verify that a sufficiently specific brief can proceed directly to a plan. Local demo mode uses a fixed clarification fixture for “Help me explore business ideas”; live question wording and relevance come from the selected model.

## Web search in chat

Apply `0004_chat_web_search.sql` before deploying chat web search. This adds a
`web_search` flag to existing chat runs, defaulting to off for previous runs. No
additional provider key is required: search uses the existing OpenAI/Gateway
configuration. The normal production migration command applies this alongside
any other pending migrations.

For a signed-in smoke test, select Web search in Chat options, ask for current
information, and verify the reply includes working citations and a sources list.
Refresh the conversation and confirm the sources remain. This path should create
no research plan or report. Dismiss the tool chip to return to regular chat, and
verify a wide table scrolls horizontally on a phone without widening the page.

## Durable Workflow dispatch

D1 queued runs are the durable outbox. Submitting chat, scope answers, or research
approval saves the run before publishing `{runId}` to a Cloudflare Queue. The HTTP
request awaits queue acceptance with a four-second budget; it never creates a
Workflow in post-response `waitUntil` work. If queue acknowledgement is lost, the
run remains queued and manual retry or the five-minute cron republishes the same
ID. D1 and Queue publication are not a single transaction, so this recovery path
is required. Duplicate messages are expected and safe.

The Queue consumer skips deleted, canceled, completed, running, or expired runs.
For eligible queued runs it creates the Workflow under the saved run ID, confirms
an existing instance after ambiguous acknowledgement, and acknowledges the Queue
message only when dispatch is confirmed. Creation/status calls have four-second
budgets, with at most two creation attempts per delivery. The Queue retries failed
deliveries with a bounded delay (up to 60 seconds), five retries, batch size one,
and a one-second batching timeout. If delivery retries are exhausted, the saved
D1 run remains available to cron recovery until its normal deadline. No provider
response creation is retried by this dispatch mechanism.

Startup failures record `dispatch_failed` events. The UI distinguishes Waiting to
start from active planning/research and offers Retry start through the owner-only,
same-origin `POST /api/conversations/:id/runs/:id/retry-start` route. Logs include
run ID, stage, attempt, validated exception name and HTTP status when available;
raw exceptions, prompts, headers and credentials are excluded.

Before deploying this architecture, inspect existing queues, then create the
missing queue for the target environment:

```bash
pnpm --filter @citadel/lyra exec wrangler queues list
pnpm --filter @citadel/lyra exec wrangler queues create lyra-production-dispatch
```

Use `lyra-staging-dispatch` for staging. Do not recreate a queue that already
exists or rerun database provisioning on an existing environment. Wrangler config
binds `RUN_DISPATCH` and the same Worker's queue consumer separately for each
environment. Local development emulates `lyra-local-dispatch` without provisioning
remote resources. Fresh-environment `scripts/provision.mjs` includes queue creation.

On 2026-10-20, Cloudflare Workers observability recorded a clarification-answer
request returning 202 with a runtime warning that its waitUntil tasks exceeded the
post-response allowance and were canceled (invocation wall time 30,606 ms). D1
saved the request at 12:32:30 UTC, but the Workflow was only created at 12:35:30 UTC.
This confirms the old background dispatch exceeded the response-lifecycle budget;
the underlying reason that the creation RPC stalled is not established by those
logs. Queue consumers execute and retry independently of the submitting request.
