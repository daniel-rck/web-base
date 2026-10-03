import { describe, expect, it } from "vitest";
import { normalizeRepoPath, relativePathProblem, resolveInside } from "./paths.ts";

describe("relativePathProblem", () => {
  it.each([
    ["src/lib/ui/theme.css", undefined],
    [".oxlintrc.json", undefined],
    ["", "is empty"],
    ["/etc/passwd", "is absolute"],
    ["C:/x", "is absolute"],
    ["a\\b", "uses backslashes"],
    ["../x", "escapes its root"],
    ["a/../../x", "escapes its root"],
    ["./a", 'is not normalized (use "a")'],
    ["a//b", 'is not normalized (use "a/b")'],
  ])("%j → %j", (path, problem) => {
    expect(relativePathProblem(path)).toBe(problem);
  });
});

describe("resolveInside", () => {
  it("resolves inside the root and refuses to leave it", () => {
    expect(resolveInside("/app", "src/a.ts")).toBe("/app/src/a.ts");
    expect(() => resolveInside("/app", "../etc")).toThrow(/is not inside/);
    expect(() => resolveInside("/app", "/etc")).toThrow(/is not inside/);
    expect(() => resolveInside("/app", ".")).toThrow(/is not inside/);
  });
});

describe("normalizeRepoPath", () => {
  it("accepts the ways an app may spell a path", () => {
    expect(normalizeRepoPath("./src/lib/db/useLiveQuery.ts")).toBe("src/lib/db/useLiveQuery.ts");
    expect(normalizeRepoPath("src\\lib\\x.ts")).toBe("src/lib/x.ts");
  });
});
