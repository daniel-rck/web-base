/** Compare text modulo line endings: a CRLF checkout (`core.autocrlf`) is not drift. */
export function normalizeEol(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

/** Write machine-readable output (a diff, JSON) straight to stdout, bypassing consola. */
export function writeOut(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}
