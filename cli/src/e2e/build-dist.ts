import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "pathe";

/**
 * vitest globalSetup: rebuild cli/dist before the e2e suite runs, so it tests
 * the bundle of the current source — not whatever was last committed. CI
 * then fails if the rebuilt bundle differs from the committed one.
 */
export default function setup(): void {
  const root = resolve(fileURLToPath(import.meta.url), "../../../..");
  const result = spawnSync("bun", ["run", "build"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`bun run build failed:\n${result.stderr || result.error?.message}`);
  }
}
