import { loadRegistry } from "../src/registry/loader";

const USAGE = "Usage: pdf-forge registry list [--json]";

type ListOptions = Readonly<{ json: boolean }>;

function parseArguments(args: readonly string[]): ListOptions | string {
  let json = false;

  for (const arg of args) {
    if (arg === "--json") {
      if (json) return 'Duplicate option "--json".';
      json = true;
    } else if (arg.startsWith("-")) {
      return `Unknown option "${arg}".`;
    } else {
      return `Unexpected argument "${arg}".`;
    }
  }

  return { json };
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
    const entries = registry.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      version: entry.version,
      formats: entry.formats,
      themes: entry.themes,
    }));

    if (options.json) {
      console.log(JSON.stringify({ version: registry.version, entries }));
    } else {
      console.log(`Registry version: ${registry.version}`);
      for (const entry of entries) {
        console.log(`\n${entry.id} (${entry.kind}) v${entry.version}`);
        console.log(`  Formats: ${entry.formats.join(", ")}`);
        console.log(`  Themes: ${entry.themes.join(", ")}`);
      }
    }
    return 0;
  } catch (error) {
    console.error(
      "Failed to list registry:",
      error instanceof Error ? error.message : String(error)
    );
    return 1;
  }
}

process.exitCode = await main();
