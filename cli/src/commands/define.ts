import { type ArgsDef, type CommandDef, defineCommand, type ParsedArgs } from "citty";
import { consola } from "consola";
import { CliError, errorMessage, EXIT, type ExitCode } from "../exit.ts";
import { writeOut } from "../lib/text.ts";

type CliCommand<T extends ArgsDef> = {
  meta: { name: string; description: string };
  args: T;
  run: (args: ParsedArgs<T>) => Promise<ExitCode>;
};

const camelCase = (name: string) => name.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * citty silently ignores options it doesn't know, so `check --strcit` used to
 * run as a plain `check` and pass. Reject unknown options and surplus
 * positionals before the command does anything.
 */
export function assertKnownArgs(args: { _: string[] }, defs: ArgsDef): void {
  const known = new Set(["_"]);
  let positionals = 0;
  for (const [name, def] of Object.entries(defs)) {
    known.add(name);
    known.add(camelCase(name));
    if (def.type === "positional") positionals++;
    else if ("alias" in def) for (const alias of [def.alias ?? []].flat()) known.add(alias);
  }
  const unknown = Object.keys(args).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    const flags = unknown.map((key) => (key.length === 1 ? `-${key}` : `--${key}`));
    throw new CliError(`Unknown option${unknown.length > 1 ? "s" : ""}: ${flags.join(", ")}`, {
      hint: "Run with --help to see the options.",
    });
  }
  if (args._.length > positionals) {
    throw new CliError(`Unexpected argument: ${args._.slice(positionals).join(" ")}`, {
      hint: "Run with --help to see the usage.",
    });
  }
}

/** Print an error; with `--json`, also put a machine-readable envelope on stdout. */
export function reportError(command: string, err: unknown, json: boolean): void {
  consola.error(errorMessage(err));
  if (err instanceof CliError && err.hint) consola.info(err.hint);
  else if (!(err instanceof CliError) && err instanceof Error && process.env.DEBUG) {
    consola.error(err.stack);
  }
  if (json) {
    writeOut(
      JSON.stringify({
        schemaVersion: 1,
        command,
        ok: false,
        exitCode: EXIT.error,
        error: errorMessage(err),
      }),
    );
  }
}

/**
 * A citty command whose `run` returns an exit code. Every error inside it maps
 * to exit 2 with a message — nothing throws out of a command.
 */
export function defineCliCommand<T extends ArgsDef>(def: CliCommand<T>): CommandDef<T> {
  return defineCommand({
    meta: def.meta,
    args: def.args,
    async run({ args }) {
      try {
        assertKnownArgs(args, def.args);
        return await def.run(args);
      } catch (err) {
        reportError(def.meta.name, err, args.json === true);
        return EXIT.error;
      }
    },
  });
}
