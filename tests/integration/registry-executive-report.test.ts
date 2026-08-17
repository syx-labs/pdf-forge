import { describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { mergePages } from "../../src/core/merger";
import { renderPages } from "../../src/core/renderer";
import { composeDocumentPage } from "../../src/registry/compose";
import { parseDocumentManifest } from "../../src/registry/document-manifest";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const examplePath = join(
  packageRoot,
  "assets/registry/blocks/executive-report/example.json"
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function copyRegistryPackageRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pdf-forge-block-contract-"));
  await cp(join(packageRoot, "assets/registry"), join(root, "assets/registry"), {
    recursive: true,
  });
  return root;
}

describe("registry executive-report runtime", () => {
  test("composes the canonical block and renders one Playwright PDF page", async () => {
    const canonicalExample: unknown = JSON.parse(
      await readFile(examplePath, "utf-8")
    );
    if (!isRecord(canonicalExample)) {
      throw new Error("Expected the canonical executive-report example to be an object.");
    }

    const manifest = parseDocumentManifest({
      schemaVersion: "1",
      documentId: "executive-report-runtime",
      format: "docs",
      theme: "ivory-editorial",
      pages: [
        {
          id: "executive-report",
          selection: { kind: "block", id: "executive-report" },
          props: {
            ...canonicalExample,
            title: '<script>alert("title")</script> & Q2',
            summary: 'Growth < retention & "quality"',
            recommendations: [
              "Protect <capacity> & onboarding.",
              "Expand enterprise > mid-market.",
            ],
          },
        },
      ],
    });

    const html = await composeDocumentPage(
      manifest,
      manifest.pages[0],
      packageRoot
    );

    expect(html.match(/<html\b/gu)).toHaveLength(1);
    expect(html.match(/<body\b/gu)).toHaveLength(1);
    expect(html.match(/<\/body>/gu)).toHaveLength(1);
    expect(html.match(/<\/html>/gu)).toHaveLength(1);
    expect(html.match(/class="metric-card"/gu)).toHaveLength(2);
    expect(html).toContain('class="data-table"');
    expect(html).toContain(
      "&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt; &amp; Q2"
    );
    expect(html).toContain("Growth &lt; retention &amp; &quot;quality&quot;");
    expect(html).toContain("Protect &lt;capacity&gt; &amp; onboarding.");
    expect(html).not.toContain('<script>alert("title")</script>');
    expect(html).not.toContain("{{");
    expect(html).not.toContain("data-pdf-forge-");

    const tempRoot = await mkdtemp(
      join(tmpdir(), "pdf-forge-registry-executive-report-")
    );
    try {
      const inputDir = join(tempRoot, "pages");
      const renderedDir = join(tempRoot, "rendered");
      const outputPath = join(tempRoot, "executive-report.pdf");
      await mkdir(inputDir, { recursive: true });
      await writeFile(join(inputDir, "01-executive-report.html"), html, "utf-8");

      const rendered = await renderPages({
        inputDir,
        outputDir: renderedDir,
        format: "docs",
        scale: 1,
      });
      expect(rendered.files).toHaveLength(1);

      const merged = await mergePages({
        inputDir: renderedDir,
        outputPath,
      });
      expect(merged.pageCount).toBe(1);

      const pdfBytes = await readFile(outputPath);
      expect(new TextDecoder().decode(pdfBytes.subarray(0, 5))).toBe("%PDF-");
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBe(1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);

  test("fails closed on unknown block definitions, primitive refs, slots, and placeholders", async () => {
    const canonicalExample: unknown = JSON.parse(
      await readFile(examplePath, "utf-8")
    );
    if (!isRecord(canonicalExample)) {
      throw new Error("Expected the canonical executive-report example to be an object.");
    }
    const manifest = parseDocumentManifest({
      schemaVersion: "1",
      documentId: "executive-report-contract",
      format: "docs",
      theme: "ivory-editorial",
      pages: [
        {
          id: "executive-report",
          selection: { kind: "block", id: "executive-report" },
          props: canonicalExample,
        },
      ],
    });
    const roots = await Promise.all(
      Array.from({ length: 4 }, () => copyRegistryPackageRoot())
    );
    const blockRelativePath = "assets/registry/blocks/executive-report";

    try {
      const [definitionRoot, referenceRoot, slotRoot, placeholderRoot] = roots;
      if (
        definitionRoot === undefined ||
        referenceRoot === undefined ||
        slotRoot === undefined ||
        placeholderRoot === undefined
      ) {
        throw new Error("Expected four isolated registry package roots.");
      }

      const definitionPath = join(definitionRoot, blockRelativePath, "block.yaml");
      const referencePath = join(referenceRoot, blockRelativePath, "block.yaml");
      const slotPath = join(slotRoot, blockRelativePath, "template.html");
      const placeholderPath = join(
        placeholderRoot,
        blockRelativePath,
        "template.html"
      );
      const [definition, reference, slotTemplate, placeholderTemplate] =
        await Promise.all([
          readFile(definitionPath, "utf-8"),
          readFile(referencePath, "utf-8"),
          readFile(slotPath, "utf-8"),
          readFile(placeholderPath, "utf-8"),
        ]);
      await Promise.all([
        writeFile(definitionPath, `${definition}unknown: true\n`, "utf-8"),
        writeFile(
          referencePath,
          reference.replace("id: metric-card", "id: unknown-card"),
          "utf-8"
        ),
        writeFile(
          slotPath,
          `${slotTemplate}\n<aside data-pdf-forge-slot="unknown"></aside>\n`,
          "utf-8"
        ),
        writeFile(
          placeholderPath,
          placeholderTemplate.replace(
            "{{escape:title}}",
            "{{escape:unknown}}"
          ),
          "utf-8"
        ),
      ]);

      await expect(
        composeDocumentPage(manifest, manifest.pages[0], definitionRoot)
      ).rejects.toThrow("Invalid executive-report block definition");
      await expect(
        composeDocumentPage(manifest, manifest.pages[0], referenceRoot)
      ).rejects.toThrow('Unknown registry entry id "unknown-card"');
      await expect(
        composeDocumentPage(manifest, manifest.pages[0], slotRoot)
      ).rejects.toThrow('Unknown executive-report template slot "unknown"');
      await expect(
        composeDocumentPage(manifest, manifest.pages[0], placeholderRoot)
      ).rejects.toThrow(
        'Unknown placeholder "{{escape:unknown}}" in registry template for "executive-report".'
      );
    } finally {
      await Promise.all(
        roots.map((root) => rm(root, { recursive: true, force: true }))
      );
    }

    const invalidPropsManifest = parseDocumentManifest({
      ...manifest,
      pages: [
        {
          ...manifest.pages[0],
          props: { ...canonicalExample, unknown: true },
        },
      ],
    });
    await expect(
      composeDocumentPage(
        invalidPropsManifest,
        invalidPropsManifest.pages[0],
        packageRoot
      )
    ).rejects.toThrow(
      /executive-report\/block\.yaml[^\n]*dataPath "\$\.unknown"[^\n]*schemaPath "#\/additionalProperties"/u
    );
  });
});
