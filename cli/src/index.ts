import { defineCommand, runMain } from "citty";
import { addCommand } from "./commands/add.ts";
import { checkCommand } from "./commands/check.ts";
import { initCommand } from "./commands/init.ts";
import { updateCommand } from "./commands/update.ts";
import { WEB_BASE_VERSION } from "./version.ts";

const main = defineCommand({
  meta: {
    name: "web-base",
    version: WEB_BASE_VERSION,
    description: "Scaffolding CLI for daniel-rck web apps",
  },
  subCommands: {
    init: initCommand,
    add: addCommand,
    update: updateCommand,
    check: checkCommand,
  },
});

runMain(main);
