---
name: citadel-deploy
description: Validate, deploy, and verify Citadel monorepo applications on Cloudflare. Use for Lyra releases, deployment troubleshooting, and future Citadel app releases; ordinary development alone does not authorize publishing.
---

# Deploy Citadel

Use the current checkout as the source of truth. When loaded from a user installation, prefer the maintained copy at `skills/citadel-deploy/SKILL.md` in Citadel. Resolve paths below from the repository root.

## Establish the target

Read `docs/deployment.md`, the app's `package.json` and `wrangler.jsonc`, and `scripts/deploy.mjs`. Inspect `git status` and preserve unrelated changes. A deployment request authorizes release; ordinary development or creating this skill does not. Do not commit or push unless authorized in the current session.

Current Lyra production identity:

| Setting            | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| Workspace          | `@citadel/lyra`, `apps/lyra`                                   |
| Cloudflare account | `3b1a88ed9e2d5d5c1012dfd7ea934e6d`                             |
| Worker / URL       | `lyra` / `https://lyra.dsilverdi.workers.dev`                  |
| D1                 | `lyra-production`                                              |
| R2                 | `lyra-production-reports` (private)                            |
| Workflow           | `lyra-production-research`                                     |
| AI Gateway         | `lyra-production`, authenticated, logging and caching disabled |
| Access             | `dsilverdi.cloudflareaccess.com`, owner `dsilverdi@gmail.com`  |
| Worker secrets     | `OPENAI_API_KEY`, `AI_GATEWAY_TOKEN`                           |

The user confirmed Workers Paid is enabled. Do not alter billing. Verify the actual account and current config rather than recreating resources from these names. Staging is not provisioned: its placeholder config cannot be deployed. For another Citadel app, inspect its own scripts and bindings; existing deploy/provision scripts are Lyra-specific.

## Authenticate and inspect

Use the Cloudflare Wrangler skill if available and current official docs or installed CLI help for unfamiliar commands. Use the pinned Node/pnpm versions (`.node-version`, `packageManager`); activate Node through the installed version manager when necessary.

```bash
pnpm --filter @citadel/lyra exec wrangler whoami
pnpm --filter @citadel/lyra exec wrangler secret list --env production --config wrangler.jsonc
```

Check secret names only. Do not read saved OAuth credentials, print tokens, or request secrets in chat. Missing secrets must be entered privately with `wrangler secret put NAME --env production --config wrangler.jsonc` or the Worker dashboard. `AI_GATEWAY_TOKEN` is a Cloudflare API token with AI Gateway Run permission; enter its raw value without `Bearer`.

If OAuth expired, try a legitimate refresh; if browser authorization is needed, use `wrangler login` and wait for completion. If automated login fails with `request_forbidden` or a CSRF error, have the user log in from their terminal. Never reuse an OAuth URL after its callback process exits. Distinguish network, expired-auth, and permissions errors; follow session escalation policy instead of repeatedly retrying a blocked command. A Cloudflare plugin connection does not automatically authenticate Wrangler.

For routine releases, reuse the configured D1 ID, Access audience, bucket, Gateway, and secrets. Provision only missing resources in the authorized environment. Inspect existing resources first; after a partial failure, resume only the missing step. Never rerun `scripts/provision.mjs --apply` against an existing configured database or create replacements to resolve a deployment error.

## Validate and publish

Install with `pnpm install --frozen-lockfile` when dependencies need installation. Run `pnpm check` (formatting, lint, types, tests, build). Run Playwright when changes affect user flows, authentication, reconnect, or PWA behavior and local services/browser are available. Report unavailable checks accurately. Fix failed required checks before publishing.

Apply migrations and deploy sequentially:

```bash
pnpm --filter @citadel/lyra db:migrate:production
pnpm --filter @citadel/lyra deploy:production
```

Migration success is required before deployment. Migrations must be backward compatible: a later deploy failure does not undo them. Never reset production D1, delete resources, or edit an applied migration to retry a release.

**Production selection happens at build time.** `scripts/deploy.mjs production` sets `CLOUDFLARE_ENV=production`, builds, and deploys the generated config. The normal `pnpm check` build uses local config and cannot be published directly. Never deploy a stale local build by adding `--env production` only at upload time.

If pnpm is blocked by engine-store permissions, resolve through the allowed permission flow. As a fallback, use installed binaries with the correct Node PATH and reproduce the same validation tasks. For manual publication, from `apps/lyra`:

```bash
node_modules/.bin/wrangler d1 migrations apply lyra-production --env production --remote --config wrangler.jsonc
CLOUDFLARE_ENV=production node_modules/.bin/react-router build
CLOUDFLARE_ENV=production node_modules/.bin/wrangler deploy
```

Before manual publication, inspect `build/server/wrangler.json`: target environment must be `production`, name `lyra`, assets `../client`, and DB/Access/Gateway settings must match the production source config. Never enable `LOCAL_AUTH_BYPASS` or `MOCK_AI` in production. Do not disable Access for verification.

## Verify and report

Record the URL and version ID from Wrangler. Confirm migration success and expected Workflow/cron bindings. Check HTTPS without logging cookies or full signed redirect URLs:

```bash
curl --silent --show-error --output /dev/null --max-time 20 --write-out 'HTTP %{http_code}\n' https://lyra.dsilverdi.workers.dev
```

An anonymous request should redirect to the configured Access application. A 302 alone does not verify the signed-in UI or AI integration. With an authenticated browser session, verify chat/history, plan approval, cited research, reconnect, and cancellation as relevant. Otherwise request a user smoke test and mark those checks pending. Keep any authorized live OpenAI test small; documentation-only changes do not need paid AI calls.

For PWA changes, verify manifest/service-worker responses and installation while signed in; private chat/API responses must not be cached offline. For release failures, inspect the deployed version and logs first. Code rollback must retain compatible database state; do not roll back data automatically.

Update `docs/verification.md` with the date, actual checks, version, and limitations. Report the outcome and any exact user action needed. Keep secrets out of docs/output. Connecting Workers Builds or changing GitHub CI is separate unless requested; settings are maintained in `docs/deployment.md`.
