import { readdirSync, statSync } from "node:fs";
import { resolve } from "pathe";
import { describe, expect, it } from "vitest";
import { renderPackageJson } from "../commands/init-package.ts";
import type { PinTable } from "../lib/pins.ts";
import { jsonUnder, read, readJsonFile, repoRoot } from "./markdown.ts";

// cli/templates/pins.json is the one source of the fleet's version pins. The
// docs show the same table and the manifests install from it, so they must
// never disagree — not even by a package missing on one side.

const pins = readJsonFile<PinTable>("cli/templates/pins.json");

type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const manifests = readdirSync(resolve(repoRoot, "cli/templates"))
  .filter((name) => statSync(resolve(repoRoot, "cli/templates", name)).isDirectory())
  .map((name) => readJsonFile<Manifest>(`cli/templates/${name}/manifest.json`));

describe.each([["docs/specs/07-conventions.md"], ["skill/references/tech-stack.md"]])(
  "%s",
  (path) => {
    const doc = read(path);

    it("shows exactly the production pins", () => {
      expect(jsonUnder(doc, "Production dependencies")).toEqual(pins.dependencies);
    });

    it("shows exactly the dev pins", () => {
      expect(jsonUnder(doc, "Dev dependencies")).toEqual(pins.devDependencies);
    });

    it("shows the package-manager pin", () => {
      expect(jsonUnder(doc, "Package manager")).toEqual({ packageManager: pins.packageManager });
    });

    it("shows the package.json template with the pinned packageManager and init's scripts", () => {
      const template = jsonUnder(
        doc,
        path.includes("07") ? "package.json template" : "package.json template (per app)",
      ) as Record<string, unknown>;
      const rendered = renderPackageJson("x", pins.packageManager);
      expect(template.packageManager).toBe(pins.packageManager);
      expect(template.scripts).toEqual(rendered.scripts);
    });
  },
);

describe("template manifests", () => {
  it.each(manifests.map((m) => [m.name, m]))(
    "%s installs the pinned ranges, in the pinned section",
    (_, manifest) => {
      for (const section of ["dependencies", "devDependencies"] as const) {
        for (const [name, range] of Object.entries(manifest[section] ?? {})) {
          expect({ name, section, range }).toEqual({ name, section, range: pins[section][name] });
        }
      }
    },
  );
});
