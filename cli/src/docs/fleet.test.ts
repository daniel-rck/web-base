import { describe, expect, it } from "vitest";
import { read, section } from "./markdown.ts";

// The nine apps are named in several places; a new app (or a rename) must
// reach all of them, or notify-apps silently skips it.

const firstColumn = (table: string) =>
  [...table.matchAll(/^\| ([A-Z][\w-]+) \|/gm)]
    .map((m) => m[1] as string)
    .filter((name) => name !== "App");

const fleet = firstColumn(
  section(read("docs/specs/08-app-migrations.md"), "Fleet state"),
).toSorted();

describe("the fleet", () => {
  it("08's fleet table lists nine apps", () => {
    expect(fleet).toHaveLength(9);
  });

  it("SKILL.md's app table matches", () => {
    expect(firstColumn(section(read("skill/SKILL.md"), "The apps in scope")).toSorted()).toEqual(
      fleet,
    );
  });

  it("notify-apps.yml opens an issue in exactly these repos", () => {
    const workflow = read(".github/workflows/notify-apps.yml");
    const repos = [...workflow.matchAll(/daniel-rck\/([A-Z][\w-]+)/g)].map((m) => m[1] as string);
    expect([...new Set(repos)].toSorted()).toEqual(fleet);
  });

  it.each(["docs/specs/00-overview.md", "README.md"])("%s names every app", (file) => {
    const text = read(file);
    expect(fleet.filter((app) => !text.includes(app))).toEqual([]);
  });

  it("the skill description names every app", () => {
    const description = /^description: (.*)$/m.exec(read("skill/SKILL.md"))?.[1] ?? "";
    expect(fleet.filter((app) => !description.includes(app))).toEqual([]);
  });
});
