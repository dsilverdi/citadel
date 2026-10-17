import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const environment = process.argv[2];
if (!["staging", "production"].includes(environment))
  throw new Error("Choose staging or production.");
const directory = fileURLToPath(new URL("../apps/lyra", import.meta.url));
const configPath = fileURLToPath(new URL("../apps/lyra/wrangler.jsonc", import.meta.url));
const parsed = ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, "utf8"));
if (parsed.error) throw new Error("Invalid Wrangler JSONC.");
const target = parsed.config.env[environment];
if (
  !target.routes?.some((route) => route.custom_domain) ||
  target.d1_databases[0].database_id === "00000000-0000-0000-0000-000000000000" ||
  [
    "ACCESS_TEAM_DOMAIN",
    "ACCESS_AUD",
    "ALLOWED_EMAIL",
    "AI_GATEWAY_ACCOUNT_ID",
    "AI_GATEWAY_ID",
  ].some((key) => !target.vars[key])
) {
  throw new Error(
    "Configure the database, Access, AI Gateway, and custom domain before deployment. See docs/deployment.md.",
  );
}
for (const args of [
  ["exec", "react-router", "build"],
  ["exec", "wrangler", "deploy"],
]) {
  const result = spawnSync("pnpm", args, {
    cwd: directory,
    env: { ...process.env, CLOUDFLARE_ENV: environment },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
