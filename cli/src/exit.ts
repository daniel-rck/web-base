/**
 * Exit codes, modelled on diff(1): the caller can tell "the app does not
 * conform" from "the command could not run" without parsing output.
 */
export const EXIT = {
  /** Clean: the command did what was asked, or the app conforms. */
  ok: 0,
  /** Ran fine, but the app does not conform (`check` drift, `pins` mismatch). */
  failed: 1,
  /** Could not run: bad usage, bad config (malformed package.json/manifest), I/O. */
  error: 2,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * An expected failure with a message meant for the user (no stack trace). Every
 * CliError maps to exit code 2; `hint` is printed on its own line after it.
 */
export class CliError extends Error {
  readonly hint: string | undefined;
  readonly code: string | undefined;

  constructor(message: string, options: { hint?: string; code?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CliError";
    this.hint = options.hint;
    this.code = options.code;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
