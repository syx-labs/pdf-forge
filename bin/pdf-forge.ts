import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { discoverPackageRoot } from "../src/core/package-root.js";
import { setupDependencies } from "../src/core/setup.js";

const PLUGIN_ROOT = await discoverPackageRoot(import.meta.url);

const ENGINE_COMMANDS = {
  render: "render-pdf.ts",
  merge: "merge-pages.ts",
  pptx: "png-to-pptx.ts",
  "gen-images": "gen-images.ts",
  mermaid: "prerender-mermaid.ts",
  manifest: "generate-manifest.ts",
  preview: "generate-preview.ts",
  "psd-deck": "psd-to-deck.ts",
  "psd-extract": "psd-extract.ts",
  "psd-slides": "psd-to-slides.ts",
} as const;

type EngineCommand = keyof typeof ENGINE_COMMANDS;

function getConfigPath(): string {
  const home = homedir();
  const os = platform();
  if (os === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  } else if (os === "win32") {
    return join(
      process.env.APPDATA ?? join(home, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json"
    );
  }
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

async function setup() {
  console.log("pdf-forge setup\n");

  console.log("Step 1/2: Installing dependencies...");
  await setupDependencies({ pluginRoot: PLUGIN_ROOT });

  console.log("\nStep 2/2: Configuring Claude Desktop...");
  const configPath = getConfigPath();
  let config: Record<string, unknown> = {};

  try {
    const raw = await readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    const configDir = dirname(configPath);
    await mkdir(configDir, { recursive: true });
  }

  const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;

  if (mcpServers["pdf-forge"]) {
    console.log("pdf-forge already configured in Claude Desktop.");
    console.log(`Config: ${configPath}`);
    return;
  }

  mcpServers["pdf-forge"] = {
    command: "npx",
    args: ["pdf-forge-mcp"],
  };
  config.mcpServers = mcpServers;

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  console.log(`\nClaude Desktop configured: ${configPath}`);
  console.log("Restart Claude Desktop to activate pdf-forge.");
}

async function setupBrowser() {
  console.log("pdf-forge browser setup\n");
  await setupDependencies({ pluginRoot: PLUGIN_ROOT });
}

async function serve() {
  const [{ createServer }, { StdioServerTransport }] = await Promise.all([
    import("../src/mcp/server.js"),
    import("@modelcontextprotocol/sdk/server/stdio.js"),
  ]);
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isEngineCommand(command: string): command is EngineCommand {
  return Object.prototype.hasOwnProperty.call(ENGINE_COMMANDS, command);
}

function runEngineCommand(command: EngineCommand, args: string[]): Promise<number> {
  const script = join(PLUGIN_ROOT, "scripts", ENGINE_COMMANDS[command]);
  const bunExecutable = "bun" in process.versions ? process.execPath : "bun";

  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(bunExecutable, ["run", script, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PDF_FORGE_HOME: PLUGIN_ROOT,
      },
      stdio: "inherit",
    });

    child.once("error", rejectCommand);
    child.once("close", (code) => resolveCommand(code ?? 1));
  });
}

function printHelp() {
  console.log("pdf-forge - HTML/Tailwind rendering pipeline\n");
  console.log("Usage:");
  console.log("  pdf-forge                         Start the MCP server");
  console.log("  pdf-forge serve                   Start the MCP server");
  console.log("  pdf-forge setup                   Install Chromium and configure Claude Desktop");
  console.log("  pdf-forge setup-browser           Install Playwright Chromium only");
  console.log("  pdf-forge render <pages> [...]    Render HTML pages to PNG/PDF");
  console.log("  pdf-forge merge <rendered> [...]  Merge PNG/PDF pages into one PDF");
  console.log("  pdf-forge pptx <rendered> [...]   Export rendered PNGs to PPTX (requires uv)");
  console.log("  pdf-forge gen-images <root> <manifest> [...]  Generate imagery (requires codex)");
  console.log("  pdf-forge mermaid <manifest> [...]           Pre-render Mermaid SVGs");
  console.log("  pdf-forge manifest <rendered> [...]           Generate a social manifest");
  console.log("  pdf-forge preview <rendered> [...]            Generate a social preview");
  console.log("  pdf-forge psd-deck|psd-extract|psd-slides [...]  PSD import tools (require uv)");
  console.log("\nRun a pipeline command with --help for its arguments when supported.");
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (command === undefined || command === "serve") {
    await serve();
    return;
  }
  if (command === "setup") {
    await setup();
    return;
  }
  if (command === "setup-browser") {
    await setupBrowser();
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (isEngineCommand(command)) {
    const code = await runEngineCommand(command, args);
    process.exitCode = code;
    return;
  }

  console.error(`Unknown command "${command}". Run pdf-forge --help.`);
  process.exitCode = 2;
}

try {
  await main();
} catch (err) {
  console.error("pdf-forge failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
