export type Edit = { op: "equal" | "delete" | "insert"; line: string };

/** Above this many LCS cells the middle is reported as replaced wholesale (still correct). */
const MAX_CELLS = 25_000_000;

/**
 * Split text into lines that keep their `\n`, so a missing final newline is a
 * difference like any other (`"a"` ≠ `"a\n"`).
 */
export function splitLines(text: string): string[] {
  return text === "" ? [] : text.split(/(?<=\n)/);
}

/**
 * Line diff from `before` to `after`: trim the common prefix and suffix, then a
 * longest-common-subsequence table over the rest. Template files are small; a
 * pathological pair beyond MAX_CELLS falls back to delete-all/insert-all.
 */
export function diffLines(before: string, after: string): Edit[] {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const edits: Edit[] = a.slice(0, start).map((line) => ({ op: "equal", line }));
  edits.push(...diffMiddle(a.slice(start, endA), b.slice(start, endB)));
  for (const line of a.slice(endA)) edits.push({ op: "equal", line });
  return edits;
}

function diffMiddle(a: string[], b: string[]): Edit[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0 || n * m > MAX_CELLS) {
    return [
      ...a.map((line): Edit => ({ op: "delete", line })),
      ...b.map((line): Edit => ({ op: "insert", line })),
    ];
  }
  // lcs[i * (m + 1) + j] = LCS length of a[i:] and b[j:], filled bottom-up.
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0);
    }
  }
  const edits: Edit[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const lineA = a[i] as string;
    const lineB = b[j] as string;
    if (lineA === lineB) {
      edits.push({ op: "equal", line: lineA });
      i++;
      j++;
    } else if ((lcs[(i + 1) * width + j] ?? 0) >= (lcs[i * width + j + 1] ?? 0)) {
      edits.push({ op: "delete", line: lineA });
      i++;
    } else {
      edits.push({ op: "insert", line: lineB });
      j++;
    }
  }
  for (; i < n; i++) edits.push({ op: "delete", line: a[i] as string });
  for (; j < m; j++) edits.push({ op: "insert", line: b[j] as string });
  return edits;
}

export function countChanges(edits: Edit[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const edit of edits) {
    if (edit.op === "insert") added++;
    else if (edit.op === "delete") removed++;
  }
  return { added, removed };
}
