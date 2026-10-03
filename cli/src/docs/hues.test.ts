import { describe, expect, it } from "vitest";
import { parseOklch, toHex } from "../test/oklch.ts";
import { read } from "./markdown.ts";
import { color, light, tableRows, themeCss } from "./theme-data.ts";

// Every accent hue far enough from the semantic hues and from each other to
// tell apart, the same table wherever it is shown, and each app's PWA
// theme_color derived from its hue rather than picked by eye.

const reserved = ["success", "warning", "danger", "info"].map((name) => {
  const value = light.get(`--color-${name}`) ?? "";
  return { name, hue: parseOklch(value, 0).h };
});

const escapeRegExp = (text: string) => text.replaceAll(/[()[\]\\.*+?^${}|]/g, "\\$&");

const circular = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("accent hues", () => {
  it("the 04 table lists every React app and the free slot", () => {
    expect(tableRows.length).toBeGreaterThanOrEqual(9);
  });

  it("every accent sits ≥25° from each reserved semantic hue", () => {
    for (const { app, hue } of tableRows) {
      for (const r of reserved) {
        expect({ app, from: r.name, ok: circular(hue, r.hue) >= 25 }).toEqual({
          app,
          from: r.name,
          ok: true,
        });
      }
    }
  });

  it("every accent sits ≥25° from every other accent", () => {
    for (const [i, a] of tableRows.entries()) {
      for (const b of tableRows.slice(i + 1)) {
        expect({ a: a.app, b: b.app, ok: circular(a.hue, b.hue) >= 25 }).toEqual({
          a: a.app,
          b: b.app,
          ok: true,
        });
      }
    }
  });

  it("the template default is the free slot, in theme.css, tokens.css and the table", () => {
    const free = tableRows.find((r) => r.app.includes("nächste App"));
    expect(free).toBeDefined();
    expect(/--accent-h: (\d+);/.exec(themeCss)?.[1]).toBe(String(free?.hue));
    expect(light.get("--accent-h")).toBe(String(free?.hue));
  });

  it("the skill's layout reference shows the same hue table", () => {
    const skill = read("skill/references/layout-system.md");
    for (const { app, hue, themeColor } of tableRows) {
      expect(skill).toMatch(
        new RegExp(`\\| ${escapeRegExp(app)} \\|[^\\n]*\`${hue}\` \\| \`${themeColor}\` \\|`),
      );
    }
  });

  it("each theme_color is the hue's accent-600 as browsers paint it (clipped to sRGB)", () => {
    for (const { app, hue, themeColor } of tableRows) {
      const hex = toHex(color("light", "--color-accent-600", hue, "clip"));
      expect({ app, themeColor }).toEqual({ app, themeColor: hex });
    }
  });

  it("the app template's theme colour is the free slot's", () => {
    const free = tableRows.find((r) => r.app.includes("nächste App"));
    const viteConfig = read("cli/templates/app/vite.config.ts");
    const indexHtml = read("cli/templates/app/index.html");
    expect(/theme_color: "(#[0-9a-f]{6})"/.exec(viteConfig)?.[1]).toBe(free?.themeColor);
    expect(/name="theme-color" content="(#[0-9a-f]{6})"/.exec(indexHtml)?.[1]).toBe(
      free?.themeColor,
    );
  });
});
