import { readdirSync } from "node:fs";
import { resolve } from "pathe";
import { describe, expect, it } from "vitest";
import { read, repoRoot } from "./markdown.ts";

// A cheap local guard for the rules in 06-workflows.md; actionlint and zizmor
// in tools-ci are the real ones.

const dir = ".github/workflows";
const workflows = readdirSync(resolve(repoRoot, dir)).filter((f) => f.endsWith(".yml"));

describe.each(workflows)("%s", (file) => {
  const yaml = read(`${dir}/${file}`);

  it("starts from least privilege", () => {
    expect(yaml).toMatch(/^permissions: \{\}$/m);
  });

  it("gives every job that runs steps a timeout", () => {
    const runsOn = yaml.match(/^ {4}runs-on:/gm)?.length ?? 0;
    const timeouts = yaml.match(/^ {4}timeout-minutes:/gm)?.length ?? 0;
    expect(timeouts).toBe(runsOn);
  });

  it("checks out without persisting credentials", () => {
    const checkouts = yaml.match(/uses: actions\/checkout@/g)?.length ?? 0;
    const unpersisted = yaml.match(/persist-credentials: false/g)?.length ?? 0;
    expect(unpersisted).toBe(checkouts);
  });

  it("pins every action by a full commit SHA", () => {
    const external = [...yaml.matchAll(/uses: ([^\s.][^\s@]*)@(\S+)/g)];
    expect(
      external.filter(([, , ref]) => !/^[0-9a-f]{40}$/.test(ref as string)).map(([use]) => use),
    ).toEqual([]);
  });

  it("hard-codes no Bun version", () => {
    expect(yaml).not.toMatch(/bun-version: "?\d/);
  });

  it("expands no expression inside a run script", () => {
    const scripts = [...yaml.matchAll(/^( +)run: \|\n((?:\1 {2}.*\n|\s*\n)*)/gm)].map(
      (m) => m[2] ?? "",
    );
    const inline = [...yaml.matchAll(/^ +run: (?!\|)(.*)$/gm)].map((m) => m[1] ?? "");
    expect([...scripts, ...inline].filter((s) => s.includes("${{"))).toEqual([]);
  });
});
