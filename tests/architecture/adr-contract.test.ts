import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ADR_PATH = resolve(
  import.meta.dir,
  "../../docs/adr/0001-typed-registry-and-governed-data.md"
);

test("ADR records the typed registry and governed data boundaries", async () => {
  const adr = await readFile(ADR_PATH, "utf-8");

  expect(adr).toContain("Playwright remains the default renderer");
  expect(adr).toContain("composition never receives database credentials");
  expect(adr).toContain("direct HTML remains supported");
  expect(adr).toContain("read-only");
});
