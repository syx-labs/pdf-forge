import { resolve, join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { setupDependencies } from "../src/core/setup.js";
import { createServer } from "../src/mcp/server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// From source (bin/) go up 1, from dist (dist/bin/) go up 2
const PLUGIN_ROOT = __dirname.includes("dist")
  ? resolve(__dirname, "../..")
  : resolve(__dirname, "..");

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

async function serve() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const command = process.argv[2];

if (command === "setup") {
  try {
    await setup();
  } catch (err) {
    console.error("Setup failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
} else if (command === "help" || command === "--help" || command === "-h") {
  console.log("pdf-forge - Professional PDF generation\n");
  console.log("Usage:");
  console.log("  npx pdf-forge-mcp          Start the MCP server");
  console.log("  npx pdf-forge-mcp setup    Install dependencies and configure Claude Desktop");
} else {
  await serve();
}
