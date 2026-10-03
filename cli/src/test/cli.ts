import { consola, type LogObject } from "consola";
import { vi } from "vitest";
import { runCli } from "../run.ts";

export type CliRun = {
  code: number;
  /** Raw stdout writes (diffs, JSON) — consola output is captured separately. */
  stdout: string;
  logs: LogObject[];
  /** Every consola line as `type: message`, joined by newlines, for `toContain`. */
  text: string;
};

function format(log: LogObject): string {
  return `${log.type}: ${log.args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")}`;
}

/**
 * Run the CLI in this process (fast, debuggable) and capture what it prints.
 * stdin is forced non-interactive so `init` never blocks on a prompt.
 */
export async function runInProcess(args: string[]): Promise<CliRun> {
  const logs: LogObject[] = [];
  const reporters = consola.options.reporters;
  const { level } = consola;
  const { throttle } = consola.options;
  consola.setReporters([{ log: (log) => void logs.push(log) }]);
  consola.level = 5;
  consola.options.throttle = 0;
  let stdout = "";
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const tty = process.stdin.isTTY;
  process.stdin.isTTY = false;
  try {
    const code = await runCli(args);
    return { code, stdout, logs, text: logs.map(format).join("\n") };
  } finally {
    write.mockRestore();
    process.stdin.isTTY = tty;
    consola.setReporters(reporters);
    consola.level = level;
    consola.options.throttle = throttle;
  }
}
