# Citadel

A personal toolkit on Cloudflare. Independent applications share a TypeScript workspace, a minimal light design system, authentication, and AI infrastructure.

**Lyra** is the first application: a responsive chat workspace for web research, plan approval, cited reports, and follow-up questions. The composer lets you select a model and its thinking effort.

## Run locally

Requires Node 22.12+ and pnpm 10.18.3. Node 24 is supported.

```bash
npm install --global pnpm@10.18.3
pnpm install
pnpm --filter @citadel/lyra db:migrate
pnpm dev
```

Open the loopback URL printed by Vite. The default configuration enables **local demo mode**: deterministic sample responses, no credentials, no billable AI requests. It exercises the same D1, Agent, and Workflow paths as live mode. The UI labels this mode explicitly.

To use live AI, copy `apps/lyra/.dev.vars.example` to `apps/lyra/.dev.vars`, supply `OPENAI_API_KEY`, and keep `MOCK_AI="false"`. Restart the development server. Never commit secrets. The initial model list is curated; your OpenAI project must have access to the selected model.

## Workspace

| Location          | Owns                                                            |
| ----------------- | --------------------------------------------------------------- |
| `apps/lyra`       | Chat UI, research orchestration, data schema, Worker deployment |
| `packages/ui`     | Owned shadcn primitives, Markdown, Inter, shared design tokens  |
| `packages/ai`     | OpenAI SDK configuration, model capabilities, usage estimates   |
| `packages/auth`   | Cloudflare Access verification and local identity               |
| `packages/config` | Shared compiler configuration                                   |

```bash
pnpm check       # formatting, lint, types, unit tests, production build
pnpm test:e2e    # desktop + mobile browser tests with local Cloudflare emulation
```

Delete a saved chat using the trash button beside its title in the history, then confirm. On desktop, the button appears on hover or keyboard focus. Active requests must be stopped and settled first. Deletion removes the chat and its saved reports.

Deep research asks up to three relevant scope questions when the brief needs clarification. Answer one at a time in the popup using a suggested option or your own text; recommendations are labeled and require your choice. Back preserves your answers, and closing the popup leaves an **Answer scope questions** card. Submitted preferences become part of the chat and inform the next plan. Research starts only after you approve that plan. A specific brief can proceed directly to a plan.

See [architecture](docs/architecture.md), [deployment](docs/deployment.md), and [adding a tool](docs/adding-a-tool.md).

Codex deployment sessions follow the versioned [Citadel deployment skill](skills/citadel-deploy/SKILL.md), discoverable through `AGENTS.md`. Invoke it with `$citadel-deploy` when installed in your Codex skills directory.

## Install on your phone

Lyra is an installable PWA. After HTTPS deployment, use **Install Lyra** in the navigation drawer, or Safari's **Share → Add to Home Screen** on iPhone/iPad. Launch it from its icon in its own window. Chat and research need an internet connection; a generic offline screen helps you reconnect. See [phone installation and offline behavior](docs/pwa.md).

## Boundaries

Lyra v1 is single-owner web research. It does not include file uploads, private connectors, public signup, billing, or offline execution. Research continues on the server when the browser closes. OpenAI background responses are explicitly stored to support recovery; Citadel stores its own history in D1. Review provider retention settings before putting sensitive material into prompts.

Lyra starts with regular chat. Use **Chat options** to enable **Web search** for a quick,
cited answer (up to three search calls in one model response), or **Deep research**
for scope clarification, plan approval, and a multi-step report. Tap the selected tool
in the composer to return to regular chat. Web search uses OpenAI's built-in search
through the existing gateway and does not require another data-provider credential.
Search replies retain the existing durable run tracking, cancellation, and source
storage; they do not enter the research planning or report pipeline. Search tool
usage is billed separately by the provider. Wide Markdown tables scroll horizontally
within the message on mobile.
