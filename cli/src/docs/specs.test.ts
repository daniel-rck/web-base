import { describe, expect, it } from "vitest";
import { WEB_BASE_VERSION } from "../version.ts";
import { codeBlocks, read, readJsonFile, section } from "./markdown.ts";

// The specs are the source of truth (CLAUDE.md), so what they show must not
// quietly fall behind the repo. Pins live in pins.test.ts.

/** `"pkg": "<range>"` pairs from every ```json block of a Markdown file. */
function docPins(path: string): Map<string, string> {
  const pins = new Map<string, string>();
  for (const block of codeBlocks(read(path), "json")) {
    for (const [, name, range] of block.matchAll(/"([@\w./-]+)":\s*"([~^]?\d[^"]*)"/g)) {
      if (name && range && !pins.has(name)) pins.set(name, range);
    }
  }
  return pins;
}

/** The "Stack is …" sentence of a skill description. */
function stackLine(path: string): string | undefined {
  return /Stack is ([^.]+)\./.exec(read(path))?.[1];
}

describe("docs match the repo", () => {
  it("01-monorepo-structure shows the current version and root pins", () => {
    const pkg = readJsonFile<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>("package.json");
    const rootPins = new Map(Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }));
    const spec = read("docs/specs/01-monorepo-structure.md");
    expect(spec).toContain(`"version": "${WEB_BASE_VERSION}"`);
    const wrong = [...docPins("docs/specs/01-monorepo-structure.md")].filter(
      ([name, range]) => rootPins.has(name) && rootPins.get(name) !== range,
    );
    expect(wrong).toEqual([]);
  });

  it("the skill spec and SKILL.md describe the same stack", () => {
    expect(stackLine("docs/specs/05-skill.md")).toBeDefined();
    expect(stackLine("docs/specs/05-skill.md")).toBe(stackLine("skill/SKILL.md"));
  });
});

describe("01-monorepo-structure shows the root configs as they are", () => {
  const spec = read("docs/specs/01-monorepo-structure.md");
  it.each([
    "package.json",
    "tsconfig.json",
    "tsconfig.templates.json",
    ".oxlintrc.json",
    ".oxfmtrc.json",
  ])("%s", (file) => {
    const [block] = codeBlocks(
      section(spec, file.startsWith(".ox") ? ".oxlintrc.json / .oxfmtrc.json" : file),
      "json",
    )
      .map((b) => JSON.parse(b) as unknown)
      .filter((b) => JSON.stringify(b) === JSON.stringify(readJsonFile(file)));
    expect(block).toEqual(readJsonFile(file));
  });

  it("vitest.config.ts", () => {
    expect(codeBlocks(section(spec, "vitest.config.ts"), "ts")[0]).toBe(read("vitest.config.ts"));
  });
});

describe("the CHANGELOG", () => {
  const changelog = read("CHANGELOG.md");
  const versions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)];

  it("collects changes under [Unreleased]", () => {
    expect(changelog).toMatch(/^## \[Unreleased\]$/m);
  });

  it("dates every release, newest first, and the newest is the current version", () => {
    const dates = versions.map((m) => m[2] as string);
    expect(dates).toEqual(dates.toSorted().toReversed());
    expect(versions[0]?.[1]).toBe(WEB_BASE_VERSION);
  });

  it("links every heading to its comparison", () => {
    for (const label of ["Unreleased", ...versions.map((m) => m[1] as string)]) {
      expect(changelog).toMatch(
        new RegExp(`^\\[${label.replaceAll(".", "\\.")}\\]: https://`, "m"),
      );
    }
  });
});

describe("specs carry no copy of a number that changes", () => {
  it("02-cli shows no literal WEB_BASE_VERSION", () => {
    expect(read("docs/specs/02-cli.md")).not.toMatch(/WEB_BASE_VERSION = "\d/);
  });

  it("03-templates repeats no version ranges (they live in pins.json)", () => {
    expect(read("docs/specs/03-templates.md").match(/`[~^]\d+\.\d+[^`]*`/g) ?? []).toEqual([]);
  });
});
