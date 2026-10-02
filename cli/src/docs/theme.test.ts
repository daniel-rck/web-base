import { describe, expect, it } from "vitest";
import {
  composite,
  contrast,
  type GamutMode,
  parseOklch,
  type Rgb,
  toLinearSrgb,
} from "../test/oklch.ts";
import { codeBlocks, read, section } from "./markdown.ts";

// The layout's colours are a contract: every text pair readable (WCAG AA,
// 4.5:1) at every app's accent hue, in light and dark, and every accent hue
// far enough from the semantic hues and from each other to tell apart.

const tokensCss = read("cli/templates/layout/tokens.css");
const themeCss = read("cli/templates/layout/theme.css");
const spec = read("docs/specs/04-layout-system.md");

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block ${selector}`);
  return css.slice(start, css.indexOf("\n}", start));
}

function declarations(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1] as string, m[2] as string]),
  );
}

const light = declarations(block(tokensCss, "@theme"));
const dark = new Map([...light, ...declarations(block(tokensCss, ':root[data-theme="dark"]'))]);
const themes = { light, dark };

/** App hues from the table in 04: rows of `| App | Name | \`hue\` |`. */
const tableRows = [
  ...section(spec, "Color tokens").matchAll(/^\| ([^|]+?) \| [^|]+ \| `(\d+)` \|/gm),
].map((m) => ({ app: m[1] as string, hue: Number(m[2]) }));
const hues = tableRows.map((r) => r.hue);
const reserved = ["success", "warning", "danger", "info"].map((name) => {
  const value = light.get(`--color-${name}`) ?? "";
  return { name, hue: parseOklch(value, 0).h };
});

function color(theme: keyof typeof themes, token: string, hue: number, mode: GamutMode): Rgb {
  const value = themes[theme].get(token);
  if (!value) throw new Error(`No token ${token}`);
  return toLinearSrgb(parseOklch(value, hue), mode);
}

/** The worst contrast of `fg` on `bg` (optionally `bg` at `alpha` over `under`) across hues and gamut modes. */
function worst(
  theme: keyof typeof themes,
  fg: string,
  bg: string,
  tint?: { alpha: number; under: string },
) {
  let min = Number.POSITIVE_INFINITY;
  for (const hue of hues) {
    for (const mode of ["clip", "map"] as const) {
      let background = color(theme, bg, hue, mode);
      if (tint) background = composite(background, tint.alpha, color(theme, tint.under, hue, mode));
      min = Math.min(min, contrast(color(theme, fg, hue, mode), background));
    }
  }
  return Number(min.toFixed(2));
}

const escapeRegExp = (text: string) => text.replaceAll(/[()[\]\\.*+?^${}|]/g, "\\$&");

const circular = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("theme tokens", () => {
  it("04-layout-system shows tokens.css and theme.css verbatim", () => {
    expect(codeBlocks(section(spec, "tokens.css"), "css")[0]).toBe(tokensCss);
    expect(codeBlocks(section(spec, "theme.css"), "css")[0]).toBe(themeCss);
  });

  it("the two dark blocks (OS preference and forced) declare the same tokens", () => {
    const system = declarations(block(tokensCss, ':root:not([data-theme="light"])'));
    const forced = declarations(block(tokensCss, ':root[data-theme="dark"]'));
    expect(system).toEqual(forced);
  });

  it.each(["light", "dark"] as const)("text tokens reach 4.5:1 on every surface (%s)", (theme) => {
    for (const fg of ["--color-fg", "--color-fg-muted", "--color-fg-subtle"]) {
      for (const bg of ["--color-surface", "--color-surface-muted"]) {
        expect({ fg, bg, ratio: worst(theme, fg, bg) >= 4.5 }).toEqual({ fg, bg, ratio: true });
      }
    }
    expect(worst(theme, "--color-fg", "--color-surface-sunken")).toBeGreaterThanOrEqual(4.5);
  });

  it("text on filled buttons and the active chip reaches 4.5:1 at every accent hue", () => {
    for (const bg of [
      "--color-accent-600",
      "--color-accent-700",
      "--color-danger",
      "--color-danger-strong",
    ]) {
      expect({ bg, ok: worst("light", "--color-fg-on-accent", bg) >= 4.5 }).toEqual({
        bg,
        ok: true,
      });
    }
  });

  it("accent text reaches 4.5:1 where the components put it", () => {
    // light: nav/badge active (700 on 100), nav label and links (600 on surface/muted)
    expect(worst("light", "--color-accent-700", "--color-accent-100")).toBeGreaterThanOrEqual(4.5);
    expect(worst("light", "--color-accent-600", "--color-surface")).toBeGreaterThanOrEqual(4.5);
    expect(worst("light", "--color-accent-600", "--color-surface-muted")).toBeGreaterThanOrEqual(
      4.5,
    );
    // dark: active pill (200 on 900/40), nav label (300 on surface)
    for (const under of ["--color-surface", "--color-surface-muted"]) {
      expect(
        worst("dark", "--color-accent-200", "--color-accent-900", { alpha: 0.4, under }),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(worst("dark", "--color-accent-300", "--color-surface")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["light", "dark"] as const)(
    "semantic text on its own tint reaches 4.5:1 (%s)",
    (theme) => {
      for (const name of ["success", "warning", "danger", "info"]) {
        const alpha = name === "warning" ? 0.2 : 0.15;
        for (const under of ["--color-surface", "--color-surface-muted"]) {
          const ratio = worst(theme, `--color-${name}-fg`, `--color-${name}`, { alpha, under });
          expect({ name, under, ok: ratio >= 4.5 }).toEqual({ name, under, ok: true });
        }
        expect(worst(theme, `--color-${name}-fg`, "--color-surface")).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(["light", "dark"] as const)(
    "the focus outline (accent-500) reaches 3:1 on the surface (%s)",
    (theme) => {
      expect(worst(theme, "--color-accent-500", "--color-surface")).toBeGreaterThanOrEqual(3);
    },
  );
});

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
    for (const { app, hue } of tableRows) {
      expect(skill).toMatch(new RegExp(`\\| ${escapeRegExp(app)} \\|[^\\n]*\`${hue}\``));
    }
  });
});
