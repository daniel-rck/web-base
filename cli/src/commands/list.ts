import { consola } from "consola";
import { listTemplates } from "../lib/manifest/load.ts";
import { isMetaTemplate } from "../lib/manifest/types.ts";

/** List every template with its description; meta-templates are tagged. */
export async function printAvailable(): Promise<void> {
  const { manifests, errors } = await listTemplates();
  if (manifests.length === 0 && errors.length === 0) {
    consola.warn("No templates available.");
    return;
  }
  consola.info("Available templates:");
  for (const t of manifests) {
    consola.log(`  ${t.name}${isMetaTemplate(t) ? " [meta]" : ""} — ${t.description}`);
  }
  for (const { path, message } of errors) {
    consola.warn(`  ${path} — could not load: ${message}`);
  }
}
