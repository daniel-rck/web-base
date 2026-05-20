import { defineCommand, runMain } from "citty";
import { addCommand } from "./commands/add.ts";
import { initCommand } from "./commands/init.ts";
import { updateCommand } from "./commands/update.ts";

const main = defineCommand({
  meta: {
    name: "web-base",
    version: "0.1.0",
    description: "Scaffolding CLI for daniel-rck web apps",
  },
  subCommands: {
    init: initCommand,
    add: addCommand,
    update: updateCommand,
  },
});

runMain(main);
