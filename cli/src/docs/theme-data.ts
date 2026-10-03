import { type GamutMode, parseOklch, type Rgb, toLinearSrgb } from "../test/oklch.ts";
import { read, section } from "./markdown.ts";

// The layout's colours as the theme tests read them: the token blocks of
// tokens.css and the per-app hue table in 04-layout-system.md.

export const tokensCss = read("cli/templates/layout/tokens.css");
export const themeCss = read("cli/templates/layout/theme.css");
export const spec = read("docs/specs/04-layout-system.md");

export function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block ${selector}`);
  return css.slice(start, css.indexOf("\n}", start));
}

export function declarations(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1] as string, m[2] as string]),
  );
}

export const light = declarations(block(tokensCss, "@theme"));
export const dark = new Map([
  ...light,
  ...declarations(block(tokensCss, ':root[data-theme="dark"]')),
]);
const themes = { light, dark };
export type Theme = keyof typeof themes;

/** App hues from the table in 04: rows of `| App | Name | \`hue\` | \`#hex\` |`. */
export const tableRows = [
  ...section(spec, "Color tokens").matchAll(
    /^\| ([^|]+?) \| [^|]+ \| `(\d+)` \| `(#[0-9a-f]{6})` \|/gm,
  ),
].map((m) => ({ app: m[1] as string, hue: Number(m[2]), themeColor: m[3] as string }));
export const hues = tableRows.map((r) => r.hue);

export function color(theme: Theme, token: string, hue: number, mode: GamutMode): Rgb {
  const value = themes[theme].get(token);
  if (!value) throw new Error(`No token ${token}`);
  return toLinearSrgb(parseOklch(value, hue), mode);
}
