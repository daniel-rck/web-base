import { describe, expect, it } from "vitest";
import { runInProcess } from "./test/cli.ts";
import { WEB_BASE_VERSION } from "./version.ts";

describe("runCli", () => {
  it("prints usage and exits 2 without a command", async () => {
    const run = await runInProcess([]);
    expect(run.code).toBe(2);
    expect(run.text).toContain("USAGE");
    expect(run.text).not.toContain("\u001b[");
  });

  it("prints usage and exits 0 for --help, also per command", async () => {
    expect((await runInProcess(["--help"])).code).toBe(0);
    const check = await runInProcess(["check", "--help"]);
    expect(check.code).toBe(0);
    expect(check.text).toContain("--strict");
  });

  it("prints the version", async () => {
    const run = await runInProcess(["--version"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(`${WEB_BASE_VERSION}\n`);
  });

  it("exits 2 for an unknown command", async () => {
    const run = await runInProcess(["frobnicate"]);
    expect(run.code).toBe(2);
    expect(run.text).toContain('Unknown command "frobnicate"');
  });

  it("exits 2 when --cwd has no directory", async () => {
    for (const args of [
      ["check", "--cwd"],
      ["check", "--cwd", "--json"],
    ]) {
      const run = await runInProcess(args);
      expect(run.code).toBe(2);
      expect(run.text).toContain("--cwd needs a directory.");
    }
  });

  it("exits 2 when a required positional is missing", async () => {
    const run = await runInProcess(["update"]);
    expect(run.code).toBe(2);
    expect(run.text).toMatch(/Missing required positional argument: TEMPLATE/);
  });
});
