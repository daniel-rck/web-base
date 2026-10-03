import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { runInProcess } from "../test/cli.ts";
import { cleanupScratch, readJson, scratchApp, snapshot } from "../test/fixtures.ts";
import { WEB_BASE_VERSION } from "../version.ts";

afterEach(cleanupScratch);

describe("web-base add", () => {
  it("installs core, patches package.json and stamps the version", async () => {
    const app = await scratchApp();
    const run = await runInProcess(["add", "core", "--cwd", app]);
    expect(run.code).toBe(0);
    expect(existsSync(resolve(app, "src/lib/ui/primitives.tsx"))).toBe(true);
    const pkg = await readJson(resolve(app, "package.json"));
    expect(pkg.webBase).toEqual({ version: WEB_BASE_VERSION });
    expect(pkg.scripts).toMatchObject({ lint: "oxlint && oxfmt --check" });
  });

  it("fails before writing anything when core needs a package.json and there is none", async () => {
    const app = await scratchApp({ pkg: false });
    const before = snapshot(app);
    const run = await runInProcess(["add", "core", "--cwd", app]);
    expect(run.code).toBe(2);
    expect(run.text).toMatch(/No package\.json/);
    expect(snapshot(app)).toEqual(before);
  });

  it("adds a files-only template without a package.json and says it didn't stamp", async () => {
    const app = await scratchApp({ pkg: false });
    const run = await runInProcess(["add", "hygiene", "--cwd", app]);
    expect(run.code).toBe(0);
    for (const file of ["LICENSE", "CONTRIBUTING.md", "SECURITY.md", ".editorconfig"]) {
      expect(existsSync(resolve(app, file))).toBe(true);
    }
    expect(run.text).toContain("webBase.version not stamped");
  });

  it("writes nothing with --dry-run", async () => {
    const app = await scratchApp();
    const before = snapshot(app);
    const run = await runInProcess(["add", "core", "--cwd", app, "--dry-run"]);
    expect(run.code).toBe(0);
    expect(run.text).toContain("would copy");
    expect(snapshot(app)).toEqual(before);
  });

  it("does not stamp over owned files it kept, so update won't call them local edits", async () => {
    const app = await scratchApp();
    await runInProcess(["add", "core", "--cwd", app]);
    const pkgPath = resolve(app, "package.json");
    const pkg = await readJson(pkgPath);
    await writeFile(pkgPath, JSON.stringify({ ...pkg, webBase: { version: "0.1.0" } }));
    await writeFile(resolve(app, "src/lib/ui/AppNav.tsx"), "// old\n");
    const run = await runInProcess(["add", "core", "--cwd", app]);
    expect(run.code).toBe(0);
    expect(run.text).toContain("webBase.version not stamped");
    expect((await readJson(pkgPath)).webBase).toEqual({ version: "0.1.0" });
    const update = await runInProcess(["update", "core", "--cwd", app]);
    expect(update.text).not.toContain("will be reverted");
  });

  it("--force re-pulls owned files but keeps the wrangler.toml seam (live binding IDs)", async () => {
    const app = await scratchApp();
    await runInProcess(["add", "core", "--cwd", app]);
    await writeFile(resolve(app, "wrangler.toml"), 'id = "PRODUCTION-KV-ID"\n');
    await writeFile(resolve(app, "src/lib/ui/AppNav.tsx"), "// edit\n");
    const run = await runInProcess(["add", "core", "--cwd", app, "--force"]);
    expect(run.code).toBe(0);
    expect(await readFile(resolve(app, "wrangler.toml"), "utf8")).toContain("PRODUCTION-KV-ID");
    expect(await readFile(resolve(app, "src/lib/ui/AppNav.tsx"), "utf8")).not.toBe("// edit\n");
  });

  it("--force never overwrites a webBase.unmanaged file", async () => {
    const app = await scratchApp({
      pkg: { name: "x", webBase: { unmanaged: ["./src/lib/db/useLiveQuery.ts"] } },
    });
    await runInProcess(["add", "core", "--cwd", app]);
    await writeFile(resolve(app, "src/lib/db/useLiveQuery.ts"), "// fork\n");
    await runInProcess(["add", "core", "--cwd", app, "--force"]);
    expect(await readFile(resolve(app, "src/lib/db/useLiveQuery.ts"), "utf8")).toBe("// fork\n");
  });

  it("--force-scaffold implies --force and says so", async () => {
    const app = await scratchApp();
    const run = await runInProcess(["add", "hygiene", "--cwd", app, "--force-scaffold"]);
    expect(run.text).toContain("--force-scaffold implies --force");
  });

  it("does not duplicate a dependency the app has in the other section", async () => {
    const app = await scratchApp({ pkg: { name: "x", devDependencies: { idb: "^7.0.0" } } });
    await runInProcess(["add", "storage", "--cwd", app]);
    const pkg = await readJson(resolve(app, "package.json"));
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.devDependencies).toMatchObject({ idb: expect.stringMatching(/^\^8/) });
  });

  it("lists the templates when called without one", async () => {
    const run = await runInProcess(["add"]);
    expect(run.code).toBe(0);
    expect(run.text).toMatch(/core \[meta\]/);
  });

  it.each([["nope"], ["/abs/dir"], ["../x"], ["Core"]])(
    "exits 2 for the template %j",
    async (name) => {
      const app = await scratchApp();
      const run = await runInProcess(["add", name, "--cwd", app]);
      expect(run.code).toBe(2);
      expect(run.text).toMatch(/Available templates/);
    },
  );

  it("exits 2 on an unknown option or surplus argument and writes nothing", async () => {
    const app = await scratchApp();
    const before = snapshot(app);
    expect((await runInProcess(["add", "core", "--cwd", app, "--dryrun"])).code).toBe(2);
    expect((await runInProcess(["add", "core", "extra", "--cwd", app])).code).toBe(2);
    expect(snapshot(app)).toEqual(before);
  });

  it("exits 2 with the path on a malformed package.json and writes nothing", async () => {
    const app = await scratchApp();
    await writeFile(resolve(app, "package.json"), "{ nope");
    const before = snapshot(app);
    const run = await runInProcess(["add", "core", "--cwd", app]);
    expect(run.code).toBe(2);
    expect(run.text).toMatch(/Malformed package\.json at .*package\.json/);
    expect(snapshot(app)).toEqual(before);
  });

  it("exits 2 for a target directory that doesn't exist", async () => {
    const run = await runInProcess(["add", "hygiene", "--cwd", "/nonexistent/web-base-test"]);
    expect(run.code).toBe(2);
    expect(run.text).toContain("Target directory not found");
  });
});
