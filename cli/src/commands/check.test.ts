import { rm, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { runInProcess } from "../test/cli.ts";
import { cleanupScratch, readJson, scratchApp, writeJson } from "../test/fixtures.ts";

afterEach(cleanupScratch);

async function coreApp(): Promise<string> {
  const app = await scratchApp();
  await runInProcess(["add", "core", "--cwd", app]);
  return app;
}

describe("web-base check", () => {
  it("passes on a fresh scaffold, also with --strict", async () => {
    const app = await coreApp();
    expect((await runInProcess(["check", "core", "--cwd", app])).code).toBe(0);
    expect((await runInProcess(["check", "core", "--cwd", app, "--strict"])).code).toBe(0);
  });

  it.each(["router", "pwa", "worker", "hygiene"])(
    "passes `check %s` (scaffold seams only)",
    async (name) => {
      const app = await coreApp();
      const run = await runInProcess(["check", name, "--cwd", app]);
      expect(run.code).toBe(0);
    },
  );

  it("fails on drift in an owned file", async () => {
    const app = await coreApp();
    await writeFile(resolve(app, "src/lib/ui/primitives.tsx"), "// edit\n", { flag: "a" });
    const run = await runInProcess(["check", "core", "--cwd", app]);
    expect(run.code).toBe(1);
    expect(run.text).toContain("src/lib/ui/primitives.tsx — drift");
  });

  it("webBase.unmanaged exempts exactly the listed file", async () => {
    // Hausverwaltung's useLiveQuery predates the template signature. Without
    // the opt-out its CI stays red forever; the exemption must stay narrow.
    const app = await coreApp();
    await writeFile(resolve(app, "src/lib/db/useLiveQuery.ts"), "// local fork\n", { flag: "a" });
    expect((await runInProcess(["check", "core", "--cwd", app])).code).toBe(1);
    const pkgPath = resolve(app, "package.json");
    const pkg = await readJson(pkgPath);
    await writeJson(pkgPath, {
      ...pkg,
      webBase: { ...(pkg.webBase as object), unmanaged: ["src/lib/db/useLiveQuery.ts"] },
    });
    const exempt = await runInProcess(["check", "core", "--cwd", app]);
    expect(exempt.code).toBe(0);
    expect(exempt.text).toContain("unmanaged (opted out in package.json)");
    await writeFile(resolve(app, "src/lib/ui/primitives.tsx"), "// local fork\n", { flag: "a" });
    const leaked = await runInProcess(["check", "core", "--cwd", app]);
    expect(leaked.code).toBe(1);
    expect(leaked.text).toContain("unmanaged (opted out in package.json)");
  });

  it("passes a block whose only owned file is unmanaged", async () => {
    const app = await scratchApp({
      pkg: { name: "x", webBase: { unmanaged: ["src/lib/db/useLiveQuery.ts"] } },
    });
    await runInProcess(["add", "storage", "--cwd", app]);
    expect((await runInProcess(["check", "storage", "--cwd", app])).code).toBe(0);
  });

  it("warns about a leftover Biome setup; --strict fails until it's gone", async () => {
    const app = await coreApp();
    await writeFile(resolve(app, "biome.json"), "{}");
    const plain = await runInProcess(["check", "core", "--cwd", app]);
    expect(plain.code).toBe(0);
    expect(plain.text).toContain("biome.json — obsolete file");
    expect((await runInProcess(["check", "core", "--cwd", app, "--strict"])).code).toBe(1);
    await rm(resolve(app, "biome.json"));
    expect((await runInProcess(["check", "core", "--cwd", app, "--strict"])).code).toBe(0);
  });

  it("tolerates partial adoption unless --strict", async () => {
    const app = await coreApp();
    await rm(resolve(app, "src/lib/ui/AppNav.tsx"));
    expect((await runInProcess(["check", "core", "--cwd", app])).code).toBe(0);
    expect((await runInProcess(["check", "core", "--cwd", app, "--strict"])).code).toBe(1);
  });

  it("fails an app that has adopted nothing", async () => {
    const app = await scratchApp();
    const run = await runInProcess(["check", "core", "--cwd", app]);
    expect(run.code).toBe(1);
    expect(run.text).toContain("not on the base at all");
  });

  it.each([
    ["{ nope", /Malformed package\.json/],
    ['{"webBase": {"unmanaged": "src/x.ts"}}', /unmanaged must be an array/],
  ])("exits 2 on package.json %j", async (raw, message) => {
    const app = await coreApp();
    await writeFile(resolve(app, "package.json"), raw);
    const run = await runInProcess(["check", "core", "--cwd", app]);
    expect(run.code).toBe(2);
    expect(run.text).toMatch(message);
  });

  it("exits 2 on a misspelled option instead of running without it", async () => {
    const app = await coreApp();
    expect((await runInProcess(["check", "--cwd", app, "--strcit"])).code).toBe(2);
  });

  it("exits 2 for a target directory that doesn't exist", async () => {
    expect((await runInProcess(["check", "--cwd", "/nonexistent/web-base-test"])).code).toBe(2);
  });
});
