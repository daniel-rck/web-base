import type { Edit } from "./lines.ts";

type Numbered = Edit & { oldNo: number; newNo: number };

function number(edits: Edit[]): Numbered[] {
  let oldNo = 0;
  let newNo = 0;
  return edits.map((edit) => {
    if (edit.op !== "insert") oldNo++;
    if (edit.op !== "delete") newNo++;
    return { ...edit, oldNo, newNo };
  });
}

function range(lines: Numbered[], side: "old" | "new"): string {
  const counts = (l: Numbered) => (side === "old" ? l.op !== "insert" : l.op !== "delete");
  const no = (l: Numbered) => (side === "old" ? l.oldNo : l.newNo);
  const counted = lines.filter(counts);
  // A side with no lines starts at the line *before* the hunk (unified diff
  // convention); an uncounted line's number is exactly that.
  const first = counted[0] ?? lines[0];
  const start = first ? no(first) : 0;
  return counted.length === 1 ? `${start}` : `${start},${counted.length}`;
}

function render(line: Numbered): string {
  const prefix = line.op === "equal" ? " " : line.op === "delete" ? "-" : "+";
  const text = line.line.endsWith("\n") ? line.line.slice(0, -1) : line.line;
  const eofMarker = line.line.endsWith("\n") ? "" : "\n\\ No newline at end of file";
  return `${prefix}${text}${eofMarker}`;
}

/**
 * Render edits (local → template) as a unified diff that `git apply -p1`
 * accepts: `-` lines are what the app has, `+` lines what `--apply` would write.
 */
export function formatUnifiedDiff(edits: Edit[], path: string, context = 3): string {
  const lines = number(edits);
  const changes = lines.flatMap((l, i) => (l.op === "equal" ? [] : [i]));
  if (changes.length === 0) return "";
  const hunks: [number, number][] = [];
  for (const i of changes) {
    const last = hunks.at(-1);
    if (last && i - last[1] <= 2 * context + 1) last[1] = i;
    else hunks.push([i, i]);
  }
  const out = [`--- local/${path}`, `+++ web-base/${path}`];
  for (const [first, lastChange] of hunks) {
    const hunk = lines.slice(
      Math.max(0, first - context),
      Math.min(lines.length, lastChange + context + 1),
    );
    out.push(`@@ -${range(hunk, "old")} +${range(hunk, "new")} @@`, ...hunk.map(render));
  }
  return `${out.join("\n")}\n`;
}
