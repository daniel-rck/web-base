import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupScratch, readJson, scratchApp, writeJson } from "../test/fixtures.ts";

// The scenarios tools-ci.yml used to run as shell steps, against the bundle
// `bunx github:daniel-rck/web-base` executes — so they run locally too.
const root = resolve(fileURLToPath(import.meta.url), "../../../..");
const bin = resolve(root, "cli/dist/index.js");

afterEach(cleanupScratch);

function cli(cwd: string, ...args: string[]): { code: number; out: string } {
  return cliWith({}, cwd, ...args);
}

function cliWith(
  extra: Record<string, string>,
  cwd: string,
  ...args: string[]
): { code: number; out: string } {
  // Run it as a user would: no template override, no test-mode env (consola
  // silences info output under TEST=1).
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of ["WEB_BASE_TEMPLATES_DIR", "NODE_ENV", "TEST", "VITEST"]) delete env[key];
  Object.assign(env, extra);
  const result = spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: "utf8" });
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

async function coreApp(): Promise<string> {
  const app = await scratchApp();
  expect(cli(app, "add", "core").code).toBe(0);
  return app;
}

describe("the built bundle", () => {
  it("starts with exactly one shebang and is executable", () => {
    const head = readFileSync(bin, "utf8").split("\n", 2);
    expect(head[0]).toBe("#!/usr/bin/env node");
    expect(head[1]?.startsWith("#!")).toBe(false);
    expect(() => accessSync(bin, constants.X_OK)).not.toThrow();
  });

  it("prints the package.json version", async () => {
    const { version } = await readJson(resolve(root, "package.json"));
    const run = cli(root, "--version");
    expect(run.code).toBe(0);
    expect(run.out.trim()).toBe(version);
  });

  it("logs the same whatever NODE_ENV the bundle was built or is run under", async () => {
    const app = await scratchApp();
    const plain = cli(app, "add", "hygiene", "--dry-run");
    expect(plain.out).toContain("LICENSE");
    expect(cliWith({ NODE_ENV: "test" }, app, "add", "hygiene", "--dry-run").out).toBe(plain.out);
  });

  it("adds hygiene, resolving templates from the bundle's layout", async () => {
    const app = await scratchApp();
    expect(cli(app, "add", "hygiene").code).toBe(0);
    for (const file of ["LICENSE", "CONTRIBUTING.md", "SECURITY.md", ".editorconfig"]) {
      expect(() => accessSync(resolve(app, file))).not.toThrow();
    }
  });

  it("passes check (and --strict) on a fresh core scaffold", async () => {
    const app = await coreApp();
    expect(cli(app, "check", "core").code).toBe(0);
    expect(cli(app, "check", "core", "--strict").code).toBe(0);
  });

  it("carries exit codes 1 (drift) and 2 (usage) across the process boundary", async () => {
    const app = await coreApp();
    await writeFile(resolve(app, "src/lib/ui/primitives.tsx"), "// edit\n", { flag: "a" });
    expect(cli(app, "check", "core").code).toBe(1);
    expect(cli(app, "check", "--strcit").code).toBe(2);
  });

  it("webBase.unmanaged exempts one owned file and nothing else", async () => {
    const app = await coreApp();
    await writeFile(resolve(app, "src/lib/db/useLiveQuery.ts"), "// local fork\n", { flag: "a" });
    expect(cli(app, "check", "core").code).toBe(1);
    const pkgPath = resolve(app, "package.json");
    const pkg = await readJson(pkgPath);
    await writeJson(pkgPath, {
      ...pkg,
      webBase: { ...(pkg.webBase as object), unmanaged: ["src/lib/db/useLiveQuery.ts"] },
    });
    expect(cli(app, "check", "core").code).toBe(0);
    await writeFile(resolve(app, "src/lib/ui/primitives.tsx"), "// local fork\n", { flag: "a" });
    expect(cli(app, "check", "core").code).toBe(1);
  });

  it("reports a leftover biome.json; --strict fails until it is removed", async () => {
    const app = await coreApp();
    await writeFile(resolve(app, "biome.json"), "{}");
    expect(cli(app, "check", "core").code).toBe(0);
    expect(cli(app, "check", "core", "--strict").code).toBe(1);
    await rm(resolve(app, "biome.json"));
    expect(cli(app, "check", "core", "--strict").code).toBe(0);
  });

  it("update core --apply restores a missing owned file (not a no-op)", async () => {
    const app = await coreApp();
    await rm(resolve(app, "src/lib/ui/primitives.tsx"));
    expect(cli(app, "update", "core", "--apply").code).toBe(0);
    expect(() => accessSync(resolve(app, "src/lib/ui/primitives.tsx"))).not.toThrow();
  });

  it("add core --force keeps the wrangler.toml seam with its live binding IDs", async () => {
    const app = await coreApp();
    await writeFile(resolve(app, "wrangler.toml"), 'id = "PRODUCTION-KV-ID"\n', { flag: "a" });
    expect(cli(app, "add", "core", "--force").code).toBe(0);
    expect(readFileSync(resolve(app, "wrangler.toml"), "utf8")).toContain("PRODUCTION-KV-ID");
  });
});
