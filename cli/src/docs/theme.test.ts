import { describe, expect, it } from "vitest";
import { composite, contrast } from "../test/oklch.ts";
import { codeBlocks, section } from "./markdown.ts";
import {
  block,
  color,
  declarations,
  hues,
  spec,
  type Theme,
  themeCss,
  tokensCss,
} from "./theme-data.ts";

// The layout's colours are a contract: every text pair readable (WCAG AA,
// 4.5:1) at every app's accent hue, in light and dark (hues.test.ts guards the
// hues themselves).

/** The worst contrast of `fg` on `bg` (optionally `bg` at `alpha` over `under`) across hues and gamut modes. */
function worst(theme: Theme, fg: string, bg: string, tint?: { alpha: number; under: string }) {
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
