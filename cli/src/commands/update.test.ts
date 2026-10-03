import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { runInProcess } from "../test/cli.ts";
import {
  cleanupScratch,
  readJson,
  scratchApp,
  scratchDir,
  snapshot,
  writeJson,
} from "../test/fixtures.ts";
import { WEB_BASE_VERSION } from "../version.ts";

afterEach(cleanupScratch);

async function coreApp(pkg?: Record<string, unknown>): Promise<string> {
  const app = await scratchApp(pkg ? { pkg } : {});
  await runInProcess(["add", "core", "--cwd", app]);
  return app;
}

describe("web-base update", () => {
  it("restores a missing owned file of an adopted block (update core is not a no-op)", async () => {
    const app = await coreApp();
    await rm(resolve(app, "src/lib/ui/primitives.tsx"));
    const run = await runInProcess(["update", "core", "--cwd", app, "--apply"]);
    expect(run.code).toBe(0);
    expect(existsSync(resolve(app, "src/lib/ui/primitives.tsx"))).toBe(true);
  });

  it("refuses (exit 2) to write an owned file through a symlink", async () => {
    const app = await coreApp();
    const victim = resolve(await scratchDir("web-base-outside-"), "victim");
    await writeFile(victim, "keep me");
    await rm(resolve(app, "src/lib/ui/AppNav.tsx"));
    await symlink(victim, resolve(app, "src/lib/ui/AppNav.tsx"));
    const run = await runInProcess(["update", "core", "--cwd", app, "--apply"]);
    expect(run.code).toBe(2);
    expect(run.text).toMatch(/symlink/);
    expect(await readFile(victim, "utf8")).toBe("keep me");
  });

  it("only reports without --apply", async () => {
    const app = await coreApp();
    await writeFile(resolve(app, "src/lib/ui/AppNav.tsx"), "// edit\n");
    const run = await runInProcess(["update", "core", "--cwd", app]);
    expect(run.code).toBe(0);
    expect(run.text).toContain("Run with --apply");
    expect(await readFile(resolve(app, "src/lib/ui/AppNav.tsx"), "utf8")).toBe("// edit\n");
  });

  it("never overwrites a webBase.unmanaged file", async () => {
    const app = await coreApp({
      name: "x",
      webBase: { unmanaged: ["src/lib/db/useLiveQuery.ts"] },
    });
    await writeFile(resolve(app, "src/lib/db/useLiveQuery.ts"), "// fork\n");
    const run = await runInProcess(["update", "core", "--cwd", app, "--apply"]);
    expect(run.code).toBe(0);
    expect(run.text).toContain("unmanaged (webBase.unmanaged), skipped");
    expect(await readFile(resolve(app, "src/lib/db/useLiveQuery.ts"), "utf8")).toBe("// fork\n");
  });

  it("does not push unadopted blocks into an app via a meta-template", async () => {
    // HamsterFlight: on the tooling baseline only, no layout/storage.
    const app = await scratchApp();
    await runInProcess(["add", "oxc", "--cwd", app]);
    const run = await runInProcess(["update", "core", "--cwd", app, "--apply"]);
    expect(run.code).toBe(0);
    expect(run.text).toContain("block not adopted");
    expect(existsSync(resolve(app, "src/lib/ui/AppShell.tsx"))).toBe(false);
  });

  it("adopts a block when it is named explicitly", async () => {
    const app = await scratchApp();
    await runInProcess(["update", "layout", "--cwd", app, "--apply"]);
    expect(existsSync(resolve(app, "src/lib/ui/AppShell.tsx"))).toBe(true);
  });

  it("flags local edits as 'will be reverted' only at the current stamp", async () => {
    const app = await coreApp();
    await writeFile(resolve(app, "src/lib/ui/AppNav.tsx"), "// edit\n");
    expect((await runInProcess(["update", "core", "--cwd", app])).text).toContain(
      "will be reverted",
    );
    const pkgPath = resolve(app, "package.json");
    await writeJson(pkgPath, { ...(await readJson(pkgPath)), webBase: { version: "0.1.0" } });
    expect((await runInProcess(["update", "core", "--cwd", app])).text).not.toContain(
      "will be reverted",
    );
  });

  it("stamps on --apply", async () => {
    const app = await coreApp();
    const pkgPath = resolve(app, "package.json");
    await writeJson(pkgPath, { ...(await readJson(pkgPath)), webBase: { version: "0.1.0" } });
    await runInProcess(["update", "core", "--cwd", app, "--apply"]);
    expect((await readJson(pkgPath)).webBase).toEqual({ version: WEB_BASE_VERSION });
  });

  it("applies without a package.json and warns that it didn't stamp", async () => {
    const app = await scratchApp({ pkg: false });
    await runInProcess(["add", "hygiene", "--cwd", app]);
    const run = await runInProcess(["update", "hygiene", "--cwd", app, "--apply"]);
    expect(run.code).toBe(0);
    expect(run.text).toContain("not stamped");
  });

  it("treats a CRLF checkout of the owned files as identical and doesn't rewrite it", async () => {
    const app = await coreApp();
    const path = resolve(app, "src/lib/ui/AppNav.tsx");
    const crlf = (await readFile(path, "utf8")).replaceAll("\n", "\r\n");
    await writeFile(path, crlf);
    await runInProcess(["update", "core", "--cwd", app, "--apply"]);
    expect(await readFile(path, "utf8")).toBe(crlf);
  });

  it.each([
    ["{ nope", /Malformed package\.json/],
    ['{"webBase": {"version": 3}}', /version must be a version/],
  ])("exits 2 before writing on package.json %j", async (raw, message) => {
    const app = await scratchApp();
    await writeFile(resolve(app, "package.json"), raw);
    const before = snapshot(app);
    const run = await runInProcess(["update", "core", "--cwd", app, "--apply"]);
    expect(run.code).toBe(2);
    expect(run.text).toMatch(message);
    expect(snapshot(app)).toEqual(before);
  });

  it("exits 2 without a template argument", async () => {
    expect((await runInProcess(["update"])).code).toBe(2);
  });
});

describe("web-base update --diff", () => {
  it("shows owned and scaffold diffs, and the owned one applies with git apply", async () => {
    const app = await coreApp();
    const owned = resolve(app, "src/lib/ui/AppNav.tsx");
    const original = await readFile(owned, "utf8");
    await writeFile(owned, original.replace("export", "// local\nexport"));
    await writeFile(resolve(app, "wrangler.toml"), 'name = "real-app"\n');
    const run = await runInProcess(["update", "core", "--cwd", app, "--diff"]);
    expect(run.stdout).toContain("--- local/src/lib/ui/AppNav.tsx");
    expect(run.stdout).toContain("--- local/wrangler.toml");
    const patch = run.stdout.slice(run.stdout.indexOf("--- local/src/lib/ui/AppNav.tsx"));
    const ownedPatch = patch.slice(
      0,
      patch.indexOf("--- local/", 5) === -1 ? undefined : patch.indexOf("--- local/", 5),
    );
    execFileSync("git", ["apply", "-p1"], { cwd: app, input: ownedPatch });
    expect(await readFile(owned, "utf8")).toBe(original);
  });
});
