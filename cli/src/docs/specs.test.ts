import { describe, expect, it } from "vitest";
import { WEB_BASE_VERSION } from "../version.ts";
import { codeBlocks, read, readJsonFile } from "./markdown.ts";

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
