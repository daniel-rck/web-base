import { stripVTControlCharacters } from "node:util";
import { type CommandDef, renderUsage, runCommand } from "citty";
import { consola } from "consola";
import { main, subCommands } from "./cli.ts";
import { errorMessage, EXIT, type ExitCode } from "./exit.ts";
import { writeOut } from "./lib/text.ts";
import { WEB_BASE_VERSION } from "./version.ts";

function isSubCommand(name: string): name is keyof typeof subCommands {
  return Object.hasOwn(subCommands, name);
}

/**
 * citty's `showUsage` writes to `console.log` and colours even piped output;
 * route usage through consola like everything else, plain unless on a TTY.
 */
async function showUsage(cmd: CommandDef, parent?: CommandDef): Promise<void> {
  const usage = await renderUsage(cmd, parent);
  const color = process.stdout.isTTY === true && !process.env.NO_COLOR;
  consola.log(`${color ? usage : stripVTControlCharacters(usage)}\n`);
}

/**
 * Parse `rawArgs`, run one subcommand and return its exit code. citty's
 * `runMain` discards a command's result and exits 1 for everything, which
 * would erase the difference between "drift" (1) and "could not run" (2).
 */
export async function runCli(rawArgs: string[]): Promise<ExitCode> {
  const [first, ...rest] = rawArgs;
  if (first === undefined) {
    await showUsage(main);
    return EXIT.error;
  }
  if (first === "--help" || first === "-h") {
    await showUsage(main);
    return EXIT.ok;
  }
  if (first === "--version" && rest.length === 0) {
    writeOut(WEB_BASE_VERSION);
    return EXIT.ok;
  }
  if (!isSubCommand(first)) {
    consola.error(`Unknown command "${first}".`);
    await showUsage(main);
    return EXIT.error;
  }
  const command = subCommands[first] as CommandDef;
  if (rest.includes("--help") || rest.includes("-h")) {
    await showUsage(command, main);
    return EXIT.ok;
  }
  try {
    const { result } = await runCommand(command, { rawArgs: rest });
    return result as ExitCode;
  } catch (err) {
    // Argument errors citty raises before `run` (e.g. a missing positional).
    await showUsage(command, main);
    consola.error(errorMessage(err));
    return EXIT.error;
  }
}
