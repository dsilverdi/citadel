# Adding a Citadel tool

1. Add an independently named workspace under `apps/<tool>` and use `@citadel/config/typescript`.
2. Use React Router on Workers for web tools. Depend on `@citadel/ui` and import its stylesheet; add the app source directory to Tailwind discovery if the framework does not discover it automatically.
3. Keep the tool's routes, business logic, schema, migrations, and Wrangler bindings in that app. Give each environment its own D1/R2/Workflow resources when needed. Do not import another app's internals or use its database.
4. Authenticate with `@citadel/auth`. Use Cloudflare Access for personal tools, same-origin mutations, and owner-scoped data access.
5. Use `@citadel/ai` for OpenAI and model settings when the tool needs AI. Extract shared capabilities only when another app actually needs them.
6. Add `build`, `typecheck`, and `test` scripts. Turborepo follows workspace dependencies; shared-package changes invalidate dependent application tasks.
7. Deploy to a separate subdomain. When a second tool ships, add a small Citadel launcher that links to the independent apps.

Use shadcn's monorepo aliases when adding UI primitives so components land in `packages/ui`, not duplicate copies in each app. Keep domain-specific compositions close to their app until they become reusable.
