import { readdirSync, statSync } from "node:fs";
import { resolve } from "pathe";
import { describe, expect, it } from "vitest";
import { codeBlocks, read, repoRoot, section } from "./markdown.ts";

// The skill is read by Claude in the app repos, where web-base's own files
// don't exist — so it must describe what is really there, and link out by URL.

const skill = read("skill/SKILL.md");
const spec = read("docs/specs/05-skill.md");
const references = readdirSync(resolve(repoRoot, "skill/references")).toSorted();
const templates = readdirSync(resolve(repoRoot, "cli/templates")).filter((name) =>
  statSync(resolve(repoRoot, "cli/templates", name)).isDirectory(),
);
/** References that cover no single template. */
const GENERAL = ["ci.md", "tech-stack.md"];
const referenceFor = (template: string) =>
  template === "layout" ? "layout-system.md" : `${template}.md`;

describe("the skill", () => {
  it("05-skill shows SKILL.md's frontmatter verbatim", () => {
    const frontmatter = skill.slice(4, skill.indexOf("\n---", 4)).trim();
    expect(codeBlocks(section(spec, "SKILL.md frontmatter"), "yaml")[0]?.trim()).toBe(frontmatter);
  });

  it("05-skill's file tree lists exactly the reference files", () => {
    const tree = codeBlocks(section(spec, "File layout"), "")[0] ?? "";
    const listed = [...tree.matchAll(/([\w-]+\.md)$/gm)]
      .map((m) => m[1])
      .filter((f) => f !== "SKILL.md");
    expect(listed.toSorted()).toEqual(references);
  });

  it("SKILL.md's reference table names exactly the reference files", () => {
    const table = section(skill, "When to consult which reference");
    const named = [...table.matchAll(/\| `([\w-]+\.md)` \|/g)].map((m) => m[1]);
    expect(named.toSorted()).toEqual(references);
  });

  it("every template has a reference and every reference a template (or is general)", () => {
    const expected = [...templates.filter((t) => t !== "core").map(referenceFor), ...GENERAL];
    expect(references).toEqual(expected.toSorted());
  });

  it("links web-base's specs by URL, never by a path an installed skill can't reach", () => {
    const files = [
      "skill/SKILL.md",
      ...references.map((f) => `skill/references/${f}`),
      ...templates.map((t) => `cli/templates/${t}/manifest.json`),
    ];
    const bare = files.filter((f) => /(?<!blob\/main\/)docs\/specs\/\d\d-/.test(read(f)));
    expect(bare).toEqual([]);
  });

  it("doesn't pin a web-base release in examples (they rot); vX.Y.Z is the placeholder", () => {
    for (const file of [
      "skill/SKILL.md",
      "skill/references/ci.md",
      "docs/specs/06-workflows.md",
      "README.md",
    ]) {
      const examples = [...read(file).matchAll(/```[\w-]*\n([\s\S]*?)```/g)]
        .map((m) => m[1] ?? "")
        .join("\n");
      expect({ file, pins: examples.match(/(?:@|#|ref: )v\d+\.\d+\.\d+/g) ?? [] }).toEqual({
        file,
        pins: [],
      });
    }
  });
});
