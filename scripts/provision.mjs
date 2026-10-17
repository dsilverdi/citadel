import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const environment = process.argv[2];
if (!["staging", "production"].includes(environment)) {
  throw new Error("Usage: node scripts/provision.mjs staging|production [--apply]");
}
const name = `lyra-${environment}`;
const commands = [
  ["d1", "create", name],
  ["r2", "bucket", "create", `${name}-reports`],
];
if (!process.argv.includes("--apply")) {
  console.log(
    commands
      .map((args) => `pnpm --filter @citadel/lyra exec wrangler ${args.join(" ")}`)
      .join("\n"),
  );
  console.log(
    "Add --apply to create these resources and save the returned D1 ID. Existing resources are never deleted.",
  );
} else {
  const configPath = fileURLToPath(new URL("../apps/lyra/wrangler.jsonc", import.meta.url));
  const parsed = ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, "utf8"));
  if (parsed.error) throw new Error("The Wrangler configuration is not valid JSONC.");
  const config = parsed.config;
  if (
    config.env[environment].d1_databases[0].database_id !== "00000000-0000-0000-0000-000000000000"
  ) {
    throw new Error(
      "This environment already has a D1 ID. Provision additional resources manually to avoid duplicates.",
    );
  }
  const output = execFileSync(
    "pnpm",
    ["--filter", "@citadel/lyra", "exec", "wrangler", ...commands[0]],
    { encoding: "utf8" },
  );
  console.log(output);
  const id = /["']?database_id["']?\s*[:=]\s*["']([a-f0-9-]{36})["']/.exec(output)?.[1];
  if (!id)
    throw new Error(
      "D1 was created, but its ID could not be parsed. Set database_id manually from the output above; do not rerun provisioning.",
    );
  config.env[environment].d1_databases[0].database_id = id;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  execFileSync("pnpm", ["--filter", "@citadel/lyra", "exec", "wrangler", ...commands[1]], {
    stdio: "inherit",
  });
  console.log(
    "Resources created. Configure Access, AI Gateway, and custom domains before deploying. See docs/deployment.md.",
  );
}
