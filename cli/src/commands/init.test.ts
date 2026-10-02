import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { runInProcess } from "../test/cli.ts";
import { cleanupScratch, readJson, scratchDir, snapshot } from "../test/fixtures.ts";
import { WEB_BASE_VERSION } from "../version.ts";

afterEach(cleanupScratch);

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("web-base init", () => {
  it("scaffolds a stamped app that passes check --strict", async () => {
    const dir = await scratchDir();
    const run = await runInProcess(["init", "--cwd", dir, "--name", "scratch-app"]);
    expect(run.code).toBe(0);
    const pkg = await readJson(resolve(dir, "package.json"));
    expect(pkg).toMatchObject({
      name: "scratch-app",
      packageManager: expect.stringMatching(/^bun@/),
    });
    expect(pkg.webBase).toEqual({ version: WEB_BASE_VERSION });
    expect(run.text).toContain("src/features/");
    expect((await runInProcess(["check", "core", "--cwd", dir, "--strict"])).code).toBe(0);
  });

  it("writes nothing with --dry-run", async () => {
    const dir = await scratchDir();
    const run = await runInProcess(["init", "--cwd", dir, "--name", "scratch-app", "--dry-run"]);
    expect(run.code).toBe(0);
    expect(snapshot(dir)).toEqual({});
    const missing = resolve(dir, "not-yet");
    expect((await runInProcess(["init", "--cwd", missing, "--name", "x", "--dry-run"])).code).toBe(
      0,
    );
    expect(existsSync(missing)).toBe(false);
  });

  it("creates a target directory that doesn't exist yet", async () => {
    const dir = resolve(await scratchDir(), "new-app");
    expect((await runInProcess(["init", "--cwd", dir, "--name", "new-app"])).code).toBe(0);
    expect(existsSync(resolve(dir, "package.json"))).toBe(true);
  });

  it("refuses an existing package.json even with --force, leaving it untouched", async () => {
    const dir = await scratchDir();
    await writeFile(
      resolve(dir, "package.json"),
      '{"name":"real-app","dependencies":{"react":"19"}}',
    );
    const run = await runInProcess(["init", "--cwd", dir, "--name", "x", "--force"]);
    expect(run.code).toBe(2);
    expect(run.text).toContain("add core");
    expect(await readFile(resolve(dir, "package.json"), "utf8")).toContain("real-app");
  });

  it.each(["My App", "UPPER", "a/b", "-x", "x-"])("rejects the app name %j", async (name) => {
    const dir = await scratchDir();
    expect((await runInProcess(["init", "--cwd", dir, "--name", name])).code).toBe(2);
    expect(snapshot(dir)).toEqual({});
  });

  it("needs --name without a TTY instead of blocking on a prompt", async () => {
    const dir = await scratchDir();
    const run = await runInProcess(["init", "--cwd", dir]);
    expect(run.code).toBe(2);
    expect(run.text).toContain("--name");
  });

  it.skipIf(!hasGit)(
    "initializes git outside a repo, but never nests one inside a repo",
    async () => {
      const outside = await scratchDir();
      await runInProcess(["init", "--cwd", outside, "--name", "a"]);
      expect(existsSync(resolve(outside, ".git"))).toBe(true);

      const mono = await scratchDir();
      execFileSync("git", ["init", "-q"], { cwd: mono });
      const pkgDir = resolve(mono, "packages/app");
      await mkdir(pkgDir, { recursive: true });
      await runInProcess(["init", "--cwd", pkgDir, "--name", "b"]);
      expect(existsSync(resolve(pkgDir, ".git"))).toBe(false);
    },
  );
});
