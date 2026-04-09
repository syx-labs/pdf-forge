# pdf-forge Distribution Design

Spec para distribuicao publica do pdf-forge em Claude Code, Claude Desktop e Claude Web.

## Decisoes

- Distribuicao publica (qualquer pessoa instala)
- MCP local (Bun + Chromium na maquina do usuario)
- Marketplace proprio no GitHub + submit para o oficial Anthropic
- npm package com CLI de setup automatizado para Claude Desktop
- Tool unica `generate_pdf` + design system como MCP resources
- Monorepo unificado — core compartilhado entre plugin e MCP server

## Arquitetura

### Estrutura de Diretorios

```
pdf-forge/
  .claude-plugin/
    plugin.json              # manifest do plugin (atualizado)
    marketplace.json         # catalogo do marketplace proprio
  skills/pdf-forge/
    SKILL.md                 # skill Claude Code (inalterado)
    references/              # design system docs (inalterados)
  assets/templates/          # HTML templates (inalterados)
  src/
    core/
      renderer.ts            # extraido de scripts/render-pdf.ts
      merger.ts              # extraido de scripts/merge-pages.ts
      setup.ts               # extraido de scripts/setup.ts
      templates.ts           # carrega e lista templates disponiveis
      types.ts               # tipos compartilhados
    mcp/
      server.ts              # MCP server — tool + resources
      resources.ts           # expoe design system como MCP resources
  bin/
    pdf-forge.ts             # entrypoint CLI: npx pdf-forge setup / npx pdf-forge-mcp
  scripts/
    render-pdf.ts            # wrapper fino do core/renderer
    merge-pages.ts           # wrapper fino do core/merger
    setup.ts                 # wrapper fino do core/setup
  package.json               # npm-publishable
  tsconfig.json
  README.md
```

### Camadas

1. **`src/core/`** — logica pura de renderizacao, merge, setup e templates. Sem dependencia de CLI args ou MCP. Exporta funcoes async que recebem opcoes tipadas e retornam resultados.

2. **`scripts/`** — wrappers CLI que fazem parse de args e chamam `src/core/`. O SKILL.md continua referenciando estes scripts via `${CLAUDE_PLUGIN_ROOT}/scripts/`. Zero mudanca na experiencia Claude Code.

3. **`src/mcp/`** — MCP server que expoe o core como tool + resources. Entrypoint separado.

4. **`bin/`** — CLI publica (`npx pdf-forge setup`, `npx pdf-forge-mcp`).

## MCP Server

### Tool: `generate_pdf`

Input:

```typescript
{
  topic: string;
  format: "slides" | "docs";
  pages: Array<{
    layout: string;        // nome do template: "cover", "bento-grid", "data-table"
    content: Record<string, string>;
  }>;
  brand?: {
    primary?: string;      // Tailwind color: "purple-500"
    secondary?: string;
    theme?: "dark" | "light";
    font?: string;
  };
  outputPath?: string;     // default: ./output.pdf
  scale?: number;          // 1-4, default: 2
}
```

Output:

```typescript
{
  path: string;            // caminho absoluto do PDF gerado
  pageCount: number;
  fileSize: string;        // "2.4 MB"
}
```

Fluxo interno: recebe pages -> gera HTML a partir dos templates (substituindo placeholders) -> renderiza via Playwright -> mergeia com pdf-lib -> retorna caminho.

### MCP Resources

| URI | Conteudo | Fonte |
|-----|----------|-------|
| `pdf-forge://templates/slides` | Layouts de slides com descricao e use case | `references/slide-layouts.md` |
| `pdf-forge://templates/docs` | Layouts de documentos com descricao e use case | `references/doc-layouts.md` |
| `pdf-forge://design-system` | Regras de design (tracking, zinc, spacing) | `references/design-system.md` |
| `pdf-forge://color-palettes` | Paletas e brand customization | `references/color-palettes.md` |
| `pdf-forge://anti-patterns` | O que evitar | `references/anti-patterns.md` |

Resources lidos diretamente dos arquivos `references/` existentes. Sem duplicacao.

## Distribuicao

### npm package

Nome: `pdf-forge-mcp`

```json
{
  "name": "pdf-forge-mcp",
  "bin": {
    "pdf-forge": "./dist/bin/pdf-forge.js",
    "pdf-forge-mcp": "./dist/src/mcp/server.js"
  },
  "exports": {
    "./mcp": "./dist/src/mcp/server.js"
  },
  "files": ["dist/", "assets/", "skills/", ".claude-plugin/"]
}
```

### CLI de setup

`npx pdf-forge setup`:

1. Instala Playwright + Chromium
2. Detecta OS e localiza `claude_desktop_config.json`:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`
3. Injeta config MCP:
   ```json
   {
     "mcpServers": {
       "pdf-forge": {
         "command": "npx",
         "args": ["pdf-forge-mcp"]
       }
     }
   }
   ```
4. Pede confirmacao antes de modificar o arquivo

`npx pdf-forge-mcp` (sem subcomando): inicia o MCP server. Executado pelo Claude Desktop.

### Marketplace proprio (GitHub)

`marketplace.json` na raiz do repo:

```json
{
  "name": "syx-labs-plugins",
  "plugins": [
    {
      "name": "pdf-forge",
      "source": ".",
      "description": "Professional PDF generation with Tailwind CSS"
    }
  ]
}
```

Instalacao no Claude Code:

```bash
/plugin marketplace add syx-labs/pdf-forge
/plugin install pdf-forge@syx-labs-plugins
```

### Marketplace oficial

Submit paralelo via `claude.ai/settings/plugins/submit`. Quando aprovado:

```bash
/plugin install pdf-forge@claude-plugins-official
```

### Resumo por plataforma

| Plataforma | Instalacao |
|------------|-----------|
| Claude Code | `/plugin install pdf-forge@syx-labs-plugins` |
| Claude Desktop | `npx pdf-forge setup` |
| Claude Web | Mesma config MCP (quando suportado) |

## Build e CI/CD

### Build

- `tsconfig.json`: target ESNext, module resolution bundler
- `bun build` para gerar `dist/`
- `assets/` e `skills/` copiados como estao (sem build)

### GitHub Actions

**CI (push/PR)**:
- Type-check: `bun run tsc --noEmit`
- Teste: renderiza um template de exemplo, valida que o PDF foi gerado

**Publish (tag `v*`)**:
- Build
- `npm publish` (secret `NPM_TOKEN`)
- GitHub Release com changelog

### Versionamento

Conventional Commits + tags semver. `package.json`, `plugin.json` e `marketplace.json` compartilham a mesma versao.
