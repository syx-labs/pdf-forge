# pdf-forge Remote MCP Server Design

Spec para o MCP server remoto do pdf-forge, hospedado no Railway, acessivel pelo Claude Web.

## Decisoes

- Repo separado (`pdf-forge-remote`), importa `pdf-forge-mcp` como dependencia npm
- Railway para hosting (Docker com Node + Chromium)
- Cloudflare R2 para storage de PDFs (presigned URLs, 1h expiracao, lifecycle 24h)
- API key para autenticacao (header `Authorization: Bearer <key>`)
- MCP Streamable HTTP transport em `POST /mcp` e `GET /mcp` (a especificacao Streamable HTTP exige ambos verbos no mesmo endpoint)

### Pre-requisito no `pdf-forge-mcp`

Para o remote consumir o core via npm, `pdf-forge-mcp` precisa expor `./core` em `package.json` exports (atualmente so expoe `./mcp`):

```json
"exports": {
  "./mcp": "./dist/src/mcp/server.js",
  "./core": "./dist/src/core/index.js"
}
```

Sem isso, o Node bloqueia deep imports e `import { renderPages, mergePages } from "pdf-forge-mcp/core"` falha em runtime.

## Arquitetura

```
Claude Web → HTTPS (Bearer auth) → Railway (MCP HTTP) → Playwright render → R2 upload → presigned URL
```

### Estrutura do Repositorio

```
pdf-forge-remote/
  src/
    server.ts          # Express + MCP Streamable HTTP transport
    auth.ts            # Middleware de API key
    storage.ts         # Upload para R2 + presigned URLs
  Dockerfile           # Node 20-slim + Playwright Chromium
  package.json         # Dependencias: pdf-forge-mcp, express, @aws-sdk/client-s3
  tsconfig.json
  .env.example
  railway.json
```

### MCP Server

Endpoint MCP unico em `/mcp` com dois verbos:

- `POST /mcp` — recebe JSON-RPC do cliente.
- `GET /mcp` — abre o stream server-to-client (SSE) que a especificacao Streamable HTTP requer para notifications/server-initiated messages. Clientes compliant (Claude Web e outros) abrem essa conexao em paralelo ao POST; sem o GET o cliente trava.

Health check: `GET /health` — retorna 200 com `{ status: "ok" }`.

### Tool: `generate_pdf` (versao remota)

Input identico ao local: `format`, `pages`, `scale`. Campo `outputPath` ignorado.

Output diferente do local:
```typescript
{
  url: string;      // presigned URL do R2, expira em 1h
  pageCount: number;
  fileSize: string;
}
```

Fluxo interno:
1. Escreve HTML pages em temp dir
2. `renderPages()` do core (`pdf-forge-mcp`)
3. `mergePages()` do core
4. Upload do PDF para R2 com key `pdfs/{uuid}.pdf`
5. Gera presigned URL (1h)
6. Limpa temp dir (try/finally)
7. Retorna URL + metadata

### Resources

Reutiliza os 5 resources do `pdf-forge-mcp`, apontando para os arquivos em `node_modules/pdf-forge-mcp/skills/pdf-forge/references/`.

### Autenticacao

Middleware Express verifica `Authorization: Bearer <api-key>` em toda request (exceto `/health`). Keys em env var `API_KEYS` (comma-separated). 401 se ausente ou invalida.

### Storage R2

- SDK: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- Endpoint: `https://<account-id>.r2.cloudflarestorage.com`
- Bucket: `pdf-forge`
- Key pattern: `pdfs/{uuid}.pdf`
- Presigned URL: 1h expiracao
- Lifecycle rule: delete `pdfs/` apos 24h

### Docker

```dockerfile
FROM node:20-slim
RUN npx playwright install chromium --with-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

`npm ci --omit=dev` é a forma recomendada (npm 9+) — instala exatamente o que está no lockfile e pula devDependencies, garantindo build reproducible.

### Deploy Railway

```json
{
  "build": { "builder": "DOCKERFILE" },
  "deploy": {
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Variaveis de Ambiente

```
PORT=3000
API_KEYS=key1,key2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=pdf-forge
```

### Conexao no Claude Web

O usuario adiciona MCP remoto em claude.ai/settings:
- URL: `https://pdf-forge-remote.up.railway.app/mcp`
- Header: `Authorization: Bearer <api-key>`
