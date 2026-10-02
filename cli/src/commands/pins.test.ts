import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { runInProcess } from "../test/cli.ts";
import { cleanupScratch, readJson, scratchApp } from "../test/fixtures.ts";

afterEach(cleanupScratch);

const pinned = { packageManager: "bun@1.3.11", dependencies: { react: "^19.2.8" } };

describe("web-base pins", () => {
  it("passes when every pinned package the app uses matches", async () => {
    const app = await scratchApp({
      pkg: { name: "x", ...pinned, devDependencies: { zod: "^4.0.0" } },
    });
    const run = await runInProcess(["pins", "--cwd", app]);
    expect(run.code).toBe(0);
    expect(run.text).toContain("2 pinned entries match");
  });

  it("fails on a mismatch and on a missing packageManager, naming both", async () => {
    const app = await scratchApp({ pkg: { name: "x", dependencies: { react: "^19.0.0" } } });
    const run = await runInProcess(["pins", "--cwd", app]);
    expect(run.code).toBe(1);
    expect(run.text).toContain("dependencies.react: ^19.0.0 → ^19.2.8 [behind]");
    expect(run.text).toContain("packageManager: (not set) → bun@1.3.11 [missing]");
  });

  it("--json prints the report with the exit code", async () => {
    const app = await scratchApp({
      pkg: { name: "x", packageManager: "bun@1.3.11", dependencies: { react: "^19.0.0" } },
    });
    const run = await runInProcess(["pins", "--cwd", app, "--json"]);
    expect(run.code).toBe(1);
    expect(JSON.parse(run.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "pins",
      ok: false,
      exitCode: 1,
      mismatches: [
        { name: "react", section: "dependencies", expected: "^19.2.8", actual: "^19.0.0" },
      ],
    });
  });

  it("--apply rewrites ranges in place, adds nothing else and keeps the indentation", async () => {
    const app = await scratchApp({ pkg: false });
    const raw =
      '{\n    "name": "x",\n    "devDependencies": { "react": "^19.0.0", "zod": "^4.0.0" }\n}\n';
    await writeFile(resolve(app, "package.json"), raw);
    const run = await runInProcess(["pins", "--cwd", app, "--apply"]);
    expect(run.code).toBe(0);
    expect(run.text).toContain("bun install");
    const pkg = await readJson(resolve(app, "package.json"));
    expect(pkg).toEqual({
      name: "x",
      devDependencies: { react: "^19.2.8", zod: "^4.0.0" },
      packageManager: "bun@1.3.11",
    });
    expect(await readFile(resolve(app, "package.json"), "utf8")).toContain('\n    "name"');
    expect((await runInProcess(["pins", "--cwd", app])).code).toBe(0);
  });

  it("exits 2 without a package.json or with a malformed one", async () => {
    expect((await runInProcess(["pins", "--cwd", await scratchApp({ pkg: false })])).code).toBe(2);
    const app = await scratchApp();
    await writeFile(resolve(app, "package.json"), "{ nope");
    expect((await runInProcess(["pins", "--cwd", app])).code).toBe(2);
  });
});
