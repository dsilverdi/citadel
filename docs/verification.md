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

## Chat tools and mobile tables — 2026-10-18

Regular chat is now the default. The tools sheet offers Web search and Deep research;
the selected tool can be dismissed from the composer. Web search uses a single
cited model response with at most three tool calls, retaining normal run recovery
without planning, clarification, synthesis, or report export. Search is persisted
as an additive boolean on chat runs. Migration `0004_chat_web_search.sql` was applied
locally and must be applied remotely before deploying this change.

Formatting, lint, Lyra TypeScript checks, 44 unit tests, and client/Worker builds
passed. All 18 desktop/mobile browser scenarios passed across the full run and a
targeted rerun of the table check after adding a layout readiness wait. Coverage
includes cited search replies, sources surviving refresh, rejection of submission
ID reuse with a different tool selection, and no research plan/report for search.
The mobile table check verifies internal horizontal scrolling and no document
width overflow. A mobile screenshot was inspected. Existing research approval,
clarification, cancellation, deletion, and PWA scenarios also passed.

Browser AI responses were deterministic local samples. No live OpenAI calls,
remote migration, deployment, commit, or push were performed for this iteration.

## Chat tools production release — verified 2026-10-20

Published Worker version `10f10d7d-bfe8-430f-8257-59caa06063ad` on 2026-10-18
at https://lyra.dsilverdi.workers.dev after `pnpm check` passed (formatting,
lint, all workspace types, 44 unit tests, and client/Worker builds). The 18
desktop/mobile browser scenarios passed during feature validation. A separate
production build was verified against the configured database, private R2 bucket,
Access/Gateway vars, Workflow, asset directory, and five-minute cron. Demo mode
and local authentication bypass are absent from the production configuration.
Both required runtime secret names were verified without reading their values.

Migration `0004_chat_web_search.sql` was applied to `lyra-production` before
publication. On resuming release verification on 2026-10-20, Wrangler confirmed
this version is serving 100% of traffic and no migrations remain pending. HTTPS
returns HTTP 302 to `dsilverdi.cloudflareaccess.com`. Signed-in live web search,
citations, source persistence, and phone table scrolling remain a user smoke
test; no live OpenAI calls were made during release verification.

## Research queued after approval — 2026-10-20

Read-only production metadata identified research run `09860068-9e2e-4f85-bacf-8e2bcf2b9403`
as failed after approval. Its plan completed, dispatch and first provider submission
succeeded, and a response ID was recorded. Saved Workflow diagnostics show 322
successful polls, all returning provider status `queued`, followed by the 30-minute
deadline. No completed step evidence or usage was saved. Zero recorded usage does
not establish that the provider billed nothing. The Workflow itself reports success
because the application catches and persists the failed run.

The submission helper previously opened SSE for every background request and
returned immediately at `response.created`, closing that stream. Non-live planning,
research, and synthesis now use a normal JSON background acknowledgement and poll
the recorded response ID. This removes a plausible early-disconnect trigger; the
saved data cannot prove why the provider remained queued. Live chat streaming and
replay of older Workflow submission results remain compatible. No ambiguous paid
request is resubmitted automatically.

The deadline handler now recognizes an expired persisted deadline even when
Workflow exception wrapping loses the `ResearchLimit` class, recording `limited`
and a timeout explanation rather than a generic configuration error. Existing
production history has not been rewritten or restarted.

All 47 unit tests passed, including real-SDK mocked HTTP tests of JSON background
submission, missing IDs, rejection redaction, streaming compatibility, and no
implicit retries. Lint and Lyra TypeScript passed. No live AI requests or production
mutations were made for this investigation. The patch remains local and requires
a small signed-in live research test after deployment to confirm the mitigation.

## Research background submission release — 2026-10-20

Published Worker version `dcbf69a6-8d65-4af6-af4d-2ce5fdce5424` at
https://lyra.dsilverdi.workers.dev. `pnpm check` passed, including all workspace
types, 47 unit tests, formatting, lint, and builds. All four desktop/mobile
research approval, reconnect, and cancellation browser scenarios passed against
local demo mode. Production had no pending migrations. Both runtime secrets
were present; the separate production build was checked against source bindings,
assets, Access/Gateway configuration, and disabled local bypass/mock AI.

Wrangler confirmed the production research Workflow and five-minute cron.
Post-deployment HTTPS returned HTTP 302 to `dsilverdi.cloudflareaccess.com`.
The queued-after-approval mitigation and accurate deadline reporting are deployed;
a new signed-in research request is needed to verify live provider execution.
Existing failed runs were not restarted. No live AI calls, commit, or push were
performed for this release.

## Durable dispatch and preparation delay — 2026-10-20

Cloudflare Workers observability confirmed the clarification-answer POST returned
202 but its post-response waitUntil task was canceled after exceeding the runtime
allowance (30,606 ms invocation wall time). D1 recorded the plan run at 12:32:30 UTC;
its Workflow was created at 12:35:30 UTC and completed at 12:36:00 UTC. The actual
Workflow execution took about 26 seconds. This supports cron recovery after an
uncompleted initial dispatch, rather than three minutes of model planning. The
original creation RPC's underlying stall remains unexplained; no claim is made
that rate limiting, model speed, or plan complexity caused it.

The replacement architecture uses queued D1 runs as a durable outbox and Cloudflare
Queues for startup delivery. HTTP handlers await bounded Queue acceptance only.
The consumer acknowledges after idempotent Workflow creation/lookup succeeds,
retries failed messages, and skips runs which no longer need startup. D1 cron
recovery covers the non-atomic D1-to-Queue handoff and exhausted delivery retries.
All attempts reuse the saved Workflow ID; no provider submission is retried by
this mechanism. Logs retain only validated diagnostic fields. The UI distinguishes
Waiting to start from Preparing your research plan and offers Retry start when
handoff or dispatch cannot be confirmed. Retry reuses the existing run ID and
retains owner and same-origin authorization.

New unit coverage exercises bounded operations, ambiguous creation confirmation,
transient failures, stable-ID retries, safe diagnostic metadata, durable Queue
acceptance, per-message acknowledgement/retry, duplicate delivery and malformed
payload rejection. All 59 unit tests, lint, Lyra TypeScript, and client/Worker builds
passed. All 20 desktop/mobile browser scenarios passed through local Queue/Workflow
emulation, including queued startup retry, research clarification/approval,
cancellation, web search, deletion, mobile tables, and PWA behavior. This change remains local: no production Queue was provisioned, no remote
bindings were changed, and no new live AI requests or production deployment were
performed. Provision `lyra-production-dispatch` before release, as documented in
deployment instructions and the repository deployment skill.

## Preserve table horizontal scroll — 2026-10-21

Committed and pushed the completed queue-backed dispatch architecture and prior
research submission fix as `4e9f1a0` before investigating this issue.

Reproduced horizontal table scroll resetting from 100px to 0px when typing a draft.
Markdown's inline component functions changed identity on every parent render,
causing React to replace the table scroll container. Moved the link/table renderers
to stable module-level components so draft edits and five-second snapshots retain
the DOM and its scroll position. A second regression found during validation was
live assistant text being applied to the user message sharing the run ID, briefly
removing its table; live text now applies only to assistant messages.

The desktop/mobile table regression passed. On mobile it verifies a 100px horizontal
position remains unchanged after typing and two subsequent conversation snapshot
responses, in addition to checking readable overflow within the page. The original
renderer failed this regression. Full `pnpm check` validation covers formatting,
lint, workspace types, unit tests and builds. No deployment or further commit/push
was performed for the table fix.

## Queue dispatch and table scroll production release — 2026-10-22

Committed table-scroll preservation and the assistant-only live-text fix as
`071c920`, then published Worker version `e2f1f248-b111-43ba-a4cd-9692dde31ae8`
at https://lyra.dsilverdi.workers.dev. This release also activates the previously
committed queue-backed startup architecture (`4e9f1a0`).

`pnpm check` passed, including formatting, lint, all workspace typechecks, 59 unit
tests and builds. Six desktop/mobile browser checks passed for research approval
and reconnect, table horizontal scroll persistence across draft edits and snapshot
refreshes, and queued startup retry. Browser AI responses were local samples.

Inspected existing queues before creating the missing `lyra-production-dispatch`
queue (ID `30fc64c7a5ae4e9abf253b0a69be8343`). Post-deployment verification confirms
one producer and one consumer. No database migrations were pending; both required
runtime secret names were present. A separate production build was checked against
source Queue/Workflow, storage, asset, Access/Gateway and cron bindings, with local
auth bypass and mock AI absent. Wrangler confirmed the production Workflow and
five-minute cron along with the queue producer and consumer.

HTTPS returned HTTP 302 to `dsilverdi.cloudflareaccess.com`. Signed-in live startup
and phone table-scroll behavior remain a user smoke test. No live AI requests were
made or existing runs restarted during release verification.
