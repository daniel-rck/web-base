/**
 * The single source of truth for the web-base version. Bump this on every
 * change (SemVer, driven by the conventional-commit type) and keep the root
 * `package.json` "version" in sync — `version.test.ts` guards against drift.
 *
 * `init`/`add`/`update --apply` stamp this into a consuming app's package.json
 * (`webBase.version`), so `web-base update` can report whether an app is behind.
 */
export const WEB_BASE_VERSION = "0.2.0";

/** Compare two `x.y.z` version strings. Returns -1 (a<b), 0 (a==b), 1 (a>b). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
