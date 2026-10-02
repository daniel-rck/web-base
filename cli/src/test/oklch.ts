/**
 * OKLCH → sRGB → WCAG 2 contrast, for guarding the theme tokens. Pure math,
 * no dependency. Out-of-gamut colours are resolved two ways — per-channel
 * clipping and chroma reduction (CSS Color 4 gamut mapping) — and callers
 * take the worse result, since browsers differ.
 */
export type Oklch = { l: number; c: number; h: number; alpha?: number };
export type Rgb = [number, number, number];
export type GamutMode = "clip" | "map";

export function oklchToLinearSrgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);
const clip = (rgb: Rgb): Rgb => rgb.map((v) => Math.min(1, Math.max(0, v))) as Rgb;

export function toLinearSrgb(color: Oklch, mode: GamutMode): Rgb {
  const direct = oklchToLinearSrgb(color);
  if (mode === "clip" || inGamut(direct)) return clip(direct);
  let lo = 0;
  let hi = color.c;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearSrgb({ ...color, c: mid }))) lo = mid;
    else hi = mid;
  }
  return clip(oklchToLinearSrgb({ ...color, c: lo }));
}

const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** Paint `fg` at its alpha over an opaque `bg`, blending in gamma-encoded sRGB like browsers do. */
export function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((v, i) =>
    toLinear(alpha * toGamma(v) + (1 - alpha) * toGamma(bg[i] as number)),
  ) as Rgb;
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Parse `oklch(L C H)` or `oklch(L C H / A)`, with `var(--accent-h)` standing for `hue`. */
export function parseOklch(value: string, hue: number): Oklch {
  const m =
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+(var\(--accent-h\)|[\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/.exec(
      value,
    );
  if (!m) throw new Error(`Not an oklch() colour: ${value}`);
  const h = m[3]?.startsWith("var") ? hue : Number(m[3]);
  return { l: Number(m[1]), c: Number(m[2]), h, alpha: m[4] === undefined ? 1 : Number(m[4]) };
}
