import { loadRegistry } from "../src/registry/loader";

const USAGE = "Usage: pdf-forge registry inspect <id> [--json]";

type InspectOptions = Readonly<{ id: string; json: boolean }>;

function parseArguments(args: readonly string[]): InspectOptions | string {
  let id: string | undefined;
  let json = false;

  for (const arg of args) {
    if (arg === "--json") {
      if (json) return 'Duplicate option "--json".';
      json = true;
    } else if (arg.startsWith("-")) {
      return `Unknown option "${arg}".`;
    } else if (id === undefined) {
      id = arg;
    } else {
      return `Unexpected argument "${arg}".`;
    }
  }

  if (id === undefined) return "Missing registry entry ID.";
  return { id, json };
}

async function main(): Promise<number> {
  const options = parseArguments(process.argv.slice(2));
  if (typeof options === "string") {
    console.error(options);
    console.error(USAGE);
    return 2;
  }

  try {
    const registry = await loadRegistry(process.env.PDF_FORGE_HOME);
    const entry = registry.entries.find(
      (candidate) => candidate.id === options.id
    );
    if (!entry) {
      console.error(`Unknown registry entry "${options.id}".`);
      console.error(
        `Available IDs: ${registry.entries.map((candidate) => candidate.id).join(", ")}`
      );
      console.error(USAGE);
      return 2;
    }

    const details = {
      id: entry.id,
      kind: entry.kind,
      version: entry.version,
      formats: entry.formats,
      themes: entry.themes,
      template: entry.template,
      schema: entry.schema,
    };

    if (options.json) {
      console.log(JSON.stringify(details));
    } else {
      console.log(`${details.id} (${details.kind}) v${details.version}`);
      console.log(`Formats: ${details.formats.join(", ")}`);
      console.log(`Themes: ${details.themes.join(", ")}`);
      console.log(`Template: ${details.template}`);
      console.log(`Schema: ${details.schema}`);
    }
    return 0;
  } catch (error) {
    console.error(
      "Failed to inspect registry:",
      error instanceof Error ? error.message : String(error)
    );
    return 1;
  }
}

process.exitCode = await main();
