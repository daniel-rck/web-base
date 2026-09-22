import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "pathe";
import { describe, expect, it } from "vitest";
import { WEB_BASE_VERSION } from "./version.ts";

// The specs are the source of truth (CLAUDE.md), so the version pins they show
// must not quietly fall behind what the templates actually install. Manifests
// win for the packages they ship; `07-conventions.md` owns the rest.

const root = resolve(import.meta.dirname, "../..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

/** `"pkg": "<range>"` pairs from every ```json block of a Markdown file. */
function docPins(path: string): Map<string, string> {
  const pins = new Map<string, string>();
  for (const block of read(path).matchAll(/```json\n([\s\S]*?)```/g)) {
    for (const [, name, range] of (block[1] ?? "").matchAll(/"([@\w./-]+)":\s*"([~^]?\d[^"]*)"/g)) {
      if (name && range && !pins.has(name)) pins.set(name, range);
    }
  }
  return pins;
}

/** The "Stack is …" sentence of a skill description. */
function stackLine(path: string): string | undefined {
  return /Stack is ([^.]+)\./.exec(read(path))?.[1];
}

function manifestPins(): Map<string, string> {
  const pins = new Map<string, string>();
  for (const name of readdirSync(resolve(root, "cli/templates"))) {
    const manifest = JSON.parse(read(`cli/templates/${name}/manifest.json`)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const [dep, range] of Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })) {
      pins.set(dep, range);
    }
  }
  return pins;
}

function mismatches(doc: Map<string, string>, truth: Map<string, string>): string[] {
  return [...doc]
    .filter(([name, range]) => truth.has(name) && truth.get(name) !== range)
    .map(([name, range]) => `${name}: ${range} (expected ${truth.get(name)})`);
}

describe("docs match the source of truth", () => {
  const manifests = manifestPins();
  const conventions = docPins("docs/specs/07-conventions.md");

  it("07-conventions pins match the template manifests", () => {
    expect(mismatches(conventions, manifests)).toEqual([]);
  });

  it("the skill's tech-stack pins match 07-conventions and the manifests", () => {
    const techStack = docPins("skill/references/tech-stack.md");
    expect(mismatches(techStack, manifests)).toEqual([]);
    expect(mismatches(techStack, conventions)).toEqual([]);
  });

  it("01-monorepo-structure shows the current version and root pins", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const rootPins = new Map(Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }));
    const spec = read("docs/specs/01-monorepo-structure.md");
    expect(spec).toContain(`"version": "${WEB_BASE_VERSION}"`);
    expect(mismatches(docPins("docs/specs/01-monorepo-structure.md"), rootPins)).toEqual([]);
  });

  it("the skill spec and SKILL.md describe the same stack", () => {
    expect(stackLine("docs/specs/05-skill.md")).toBeDefined();
    expect(stackLine("docs/specs/05-skill.md")).toBe(stackLine("skill/SKILL.md"));
  });
});
