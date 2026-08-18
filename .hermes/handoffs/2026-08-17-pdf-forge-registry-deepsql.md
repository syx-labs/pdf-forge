# Handoff — PDF Forge Registry + DeepSQL

**Data:** 2026-08-17
**Branch:** `alpha/pdf-forge-task1`
**Base:** `159f29e699bb12de014b1d5ca9d1a998e8eb6028`
**Estado:** Tasks 1–30 concluídas; os 3 P1 da revisão adversarial foram remediados e todos os gates finais passaram. Este handoff integra o commit local de fechamento da Task 30.

## Objetivo

Evoluir o PDF Forge sem substituir o fluxo HTML/Playwright existente, adicionando:

- registry tipado e fail-closed de primitives/blocks/themes;
- composição governada a partir de snapshots versionados e limitados;
- provider estático e adapter HTTP DeepSQL read-only, opcional e desabilitado por padrão;
- receipts auditáveis por hashes canônicos;
- discovery/composição via CLI e MCP com compatibilidade do `generate_pdf`;
- galeria canônica, pacote executável de CWD externo e anti-slop como gate de CI.

## Done when verificado

- [x] HTML livre e `generate_pdf` permanecem compatíveis.
- [x] Playwright permanece o único renderer de produção.
- [x] Registry v1 contém `metric-card`, `data-table` e `executive-report`, com schemas, exemplos e testes.
- [x] Manifest, registry, snapshots e respostas DeepSQL são validados em boundaries `unknown`.
- [x] Data acquisition e visual composition permanecem capacidades separadas.
- [x] Static JSON funciona sem rede.
- [x] DeepSQL aceita somente query IDs allowlisted, modo `read-only`, endpoint/auth host-owned e parâmetros aprovados por policy.
- [x] Nenhum raw SQL, endpoint, auth ou provider config entra em manifest/snapshot/HTML/receipt.
- [x] Hash do snapshot no receipt foi recomputado independentemente sobre JSON canônico.
- [x] CLI/MCP discovery, `compose`, `compose_pdf`, `doctor --json` e npm pack/CWD externo foram exercitados.
- [x] As cinco regras anti-slop selecionadas são erros de CI; boundaries `src`, `bin`, `scripts`, `tests` não são ignoradas.
- [x] Galeria foi gerada com três PDFs reais e removida; nenhum artefato gerado foi versionado.
- [x] Timeout e abort externo cobrem também a policy assíncrona de parâmetros do DeepSQL, sem fetch posterior e com erros sanitizados.
- [x] `componentIds` de receipts CLI/MCP deriva do metadata imutável produzido pela composição efetiva, incluindo primitives transitivas validadas.
- [x] A aceitação procura explicitamente a canary serializada em response, snapshot e manifest, além de HTML, metadados do PDF e receipt.

## Decisões e invariantes

1. O registry é aditivo e experimental; não é um segundo framework frontend.
2. Templates usam placeholders escapados e slots explícitos; script/link/iframe/object/embed e rede são rejeitados na composição tipada.
3. `DataSnapshot` é v1, read-only, bounded, deeply frozen e serializável.
4. Redaction é explícita por coluna; não há inferência heurística de PII.
5. Receipts contêm somente IDs, hashes, metadados do PDF e warnings sanitizados; não contêm linhas, props, paths absolutos ou config do provider.
6. O adapter DeepSQL não é auto-registrado. A ativação exige host explícito, endpoint fixo, auth privada, allowlist e policy de parâmetros.
7. O MCP de discovery é read-only; falhas esperadas usam `isError: true` e não expõem paths locais.
8. `compose_pdf` preserva o `generate_pdf` legado e limpa temporários.
9. O pacote inclui os assets e source internos necessários ao skill wrapper, sem novos exports públicos de provider.
10. A galeria deriva somente de registry + examples + composer + Playwright e falha fechada se qualquer entry não puder ser renderizada.

## Evidência final pós-remediação

Executado no estado final revisado da stack:

```text
bun run lint:anti-slop
Found 0 warnings and 0 errors. (95 files, 101 rules), exit 0

bun run typecheck
exit 0

bun run build
Build success

bun test tests/core/utils.test.ts
12 pass, 0 fail

bun test tests/ --parallel=1 --timeout 60000
CI integration: pass, 0 fail (run 32100672569, antes da última remediação de segurança)
Local macOS no diff final: 345 pass e 1 timeout intermitente do Playwright; os casos direcionados de renderer e os 8 testes de galeria/validação de manifestos passaram isoladamente. O CI do head final permanece gate obrigatório antes do merge.
```

Aceitação E2E adicionada em `tests/integration/data-backed-executive-report.test.ts`:

```text
DeepSQL request/response contract
→ local fixed HTTP boundary with host-owned canary auth
→ canonical DataSnapshot
→ independent SHA-256 over canonical snapshot
→ executive-report binding
→ registry composition
→ real Playwright docs render
→ real PDF merge/load
→ receipt with matching snapshot/PDF hashes
1 pass, 0 fail, 123 expect() calls
```

A aceitação verifica que a canary de auth não aparece em snapshot, HTML, metadados extraídos do PDF ou receipt. O PDF temporário inicia com `%PDF-`, contém ao menos uma página e é removido no `finally`.

Compatibilidade legada verificada separadamente:

```text
compose_pdf MCP tool > keeps legacy generate_pdf callable with its exact raw-HTML response contract
1 pass, 0 fail
```

`git diff --check` passou. Não há `.artifacts/registry-gallery`, PDFs, PNGs, tarballs, `dist/` ou outros outputs gerados no diff.

## Revisão

- O agente pai releu os diffs completos por task antes de cada commit e rerodou os gates no estado final.
- A revisão adversarial independente `deleg_491bd296` encontrou 3 P1: timeout/abort não cobria policy DeepSQL assíncrona; component IDs do receipt eram informados pelo chamador; a aceitação não provava ausência da canary no snapshot.
- Os três P1 foram corrigidos via TDD em `deleg_48ed9d3d`. O pai releu o diff e rerodou 53 testes direcionados, anti-slop, typecheck, build e a suíte serial completa no estado final.

## Limitações conhecidas

- DeepSQL está implementado, mas permanece desabilitado e sem configuração real de ambiente; a aceitação usa servidor HTTP local e canary inerte, não um serviço externo.
- O primeiro registry tipado possui um block (`executive-report`) e duas primitives; novos blocks exigem schema/example/test próprios.
- Registry/compose continuam experimentais até decisão explícita de API pública.
- A galeria é um artefato regenerável e deliberadamente não é commitada.
- Esta execução não fez push, abriu PR, publicou pacote, ativou DeepSQL ou alterou produção.

## Rollback

- Reverter os commits locais em ordem inversa, começando pela Task 30.
- Para rollback operacional sem remover assets, ocultar/desabilitar `compose`, `compose_pdf` e qualquer registro host do DeepSQL; preservar `render`, `merge`, `pptx` e `generate_pdf`.
- Registry/assets são aditivos; nenhum template/theme legado foi apagado ou migrado.

## Próxima ação

Revisar a estratégia de rollout em cinco PRs independentes antes de qualquer push. Nenhum push/PR/merge está autorizado por esta execução.
