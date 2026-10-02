import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupScratch, scratchDir } from "../../test/fixtures.ts";
import { createPackageJson, detectStyle, loadPackageJson, savePackageJson } from "./doc.ts";
import { stampVersion } from "./webbase.ts";

afterEach(cleanupScratch);

async function pkgDir(raw: string): Promise<string> {
  const dir = await scratchDir();
  await writeFile(resolve(dir, "package.json"), raw, "utf8");
  return dir;
}

describe("loadPackageJson", () => {
  it("returns undefined when there is no package.json", async () => {
    expect(await loadPackageJson(await scratchDir())).toBeUndefined();
  });

  it("throws with the path on malformed JSON instead of reading it as empty", async () => {
    const dir = await pkgDir("{ not json");
    await expect(loadPackageJson(dir)).rejects.toThrow(
      /Malformed package\.json at .*package\.json/,
    );
  });

  it("rejects a non-object top level and badly typed sections", async () => {
    await expect(loadPackageJson(await pkgDir("[]"))).rejects.toThrow(/not a JSON object/);
    await expect(loadPackageJson(await pkgDir('{"scripts": {"a": 1}}'))).rejects.toThrow(
      /"scripts" must map names to strings/,
    );
  });

  it("tolerates a byte-order mark", async () => {
    const doc = await loadPackageJson(await pkgDir('﻿{"name":"x"}'));
    expect(doc?.data.name).toBe("x");
  });
});

describe("detectStyle", () => {
  it("keeps indentation, line endings and the final newline", () => {
    expect(detectStyle('{\n    "a": 1\n}\n')).toEqual({
      indent: "    ",
      eol: "\n",
      finalNewline: true,
    });
    expect(detectStyle('{\r\n\t"a": 1\r\n}')).toEqual({
      indent: "\t",
      eol: "\r\n",
      finalNewline: false,
    });
  });
});

describe("savePackageJson", () => {
  it("writes nothing when unchanged or in dry-run", async () => {
    const dir = await pkgDir('{"name":"x"}');
    const doc = await loadPackageJson(dir);
    if (!doc) throw new Error("no doc");
    expect(await savePackageJson(doc)).toBe("unchanged");
    stampVersion(doc, "0.6.0");
    expect(await savePackageJson(doc, { dryRun: true })).toBe("would-write");
    expect(await readFile(resolve(dir, "package.json"), "utf8")).toBe('{"name":"x"}');
  });

  it("splices a stamp-only change without reformatting the rest of the file", async () => {
    // Deliberately non-`JSON.stringify` formatting that a round-trip would reflow.
    const raw = [
      "{",
      '  "name": "scratch",',
      '  "keywords": ["a", "b", "c"],',
      '  "lint-staged": { "*.ts": ["oxlint"] }',
      "}",
      "",
    ].join("\n");
    const dir = await pkgDir(raw);
    const doc = await loadPackageJson(dir);
    if (!doc) throw new Error("no doc");
    stampVersion(doc, "0.6.0");
    expect(await savePackageJson(doc)).toBe("written");
    const after = await readFile(resolve(dir, "package.json"), "utf8");
    expect(after).toContain('"keywords": ["a", "b", "c"],');
    expect(JSON.parse(after).webBase).toEqual({ version: "0.6.0" });
  });

  it("rewrites only the version literal when already stamped", async () => {
    const raw = '{\n  "keywords": ["a"],\n  "webBase": {\n    "version": "0.1.0"\n  }\n}\n';
    const dir = await pkgDir(raw);
    const doc = await loadPackageJson(dir);
    if (!doc) throw new Error("no doc");
    stampVersion(doc, "0.6.0");
    await savePackageJson(doc);
    expect(await readFile(resolve(dir, "package.json"), "utf8")).toBe(
      raw.replace("0.1.0", "0.6.0"),
    );
  });

  it("keeps CRLF line endings when splicing a new stamp", async () => {
    const dir = await pkgDir('{\r\n  "name": "x"\r\n}\r\n');
    const doc = await loadPackageJson(dir);
    if (!doc) throw new Error("no doc");
    stampVersion(doc, "0.6.0");
    await savePackageJson(doc);
    const after = await readFile(resolve(dir, "package.json"), "utf8");
    expect(after.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("falls back to a reformat when the stamp can't be spliced", async () => {
    const dir = await pkgDir('{"name":"x","private":true}');
    const doc = await loadPackageJson(dir);
    if (!doc) throw new Error("no doc");
    stampVersion(doc, "0.6.0");
    expect(await savePackageJson(doc)).toBe("reformatted");
    expect(JSON.parse(await readFile(resolve(dir, "package.json"), "utf8")).webBase).toEqual({
      version: "0.6.0",
    });
  });

  it("creates a new file with two-space indentation", async () => {
    const dir = await scratchDir();
    const doc = createPackageJson(dir, { name: "x" });
    await savePackageJson(doc);
    expect(await readFile(resolve(dir, "package.json"), "utf8")).toBe('{\n  "name": "x"\n}\n');
  });
});
