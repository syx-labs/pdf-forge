import type { DataRow, DataSnapshot } from "../types.js";

type RequiredColumnType = "string" | "number";

const REQUIRED_COLUMNS: ReadonlyArray<
  Readonly<{ name: string; type: RequiredColumnType }>
> = Object.freeze([
  Object.freeze({ name: "region", type: "string" }),
  Object.freeze({ name: "revenue", type: "number" }),
  Object.freeze({ name: "target", type: "number" }),
  Object.freeze({ name: "recommendation", type: "string" }),
]);

function requiredColumnIndexes(snapshot: DataSnapshot): ReadonlyMap<string, number> {
  const indexes = new Map<string, number>();
  const issues: string[] = [];

  for (const required of REQUIRED_COLUMNS) {
    const index = snapshot.columns.findIndex(
      (column) => column.name === required.name
    );
    const column = snapshot.columns[index];
    if (column === undefined) {
      issues.push(`"${required.name}" is missing`);
    } else if (column.type !== required.type) {
      issues.push(
        `"${required.name}" must have type "${required.type}" (received "${column.type}")`
      );
    } else {
      indexes.set(required.name, index);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Invalid executive-report snapshot columns: ${issues.join("; ")}.`
    );
  }
  return indexes;
}

function readRequiredIndex(indexes: ReadonlyMap<string, number>, name: string): number {
  const index = indexes.get(name);
  if (index === undefined) {
    throw new Error(`Validated executive-report column "${name}" is unavailable.`);
  }
  return index;
}

function readString(row: DataRow, index: number, name: string): string {
  const value = row[index];
  if (typeof value !== "string") {
    throw new Error(`Executive-report row value for "${name}" must be a string.`);
  }
  return value;
}

function readNumber(row: DataRow, index: number, name: string): number {
  const value = row[index];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Executive-report row value for "${name}" must be a finite number.`
    );
  }
  return value;
}

function addFinite(
  total: number,
  value: number,
  name: "revenue" | "target",
  rowNumber: number
): number {
  const next = total + value;
  if (!Number.isFinite(next)) {
    throw new Error(
      `Executive-report sum for "${name}" became non-finite at row ${rowNumber}.`
    );
  }
  return next;
}

export function bindExecutiveReport(snapshot: DataSnapshot) {
  const indexes = requiredColumnIndexes(snapshot);
  if (snapshot.rows.length === 0) {
    throw new Error("Executive-report binding requires at least one row.");
  }
  if (snapshot.rows.length > 12) {
    throw new Error("Executive-report binding accepts at most 12 rows.");
  }
  const regionIndex = readRequiredIndex(indexes, "region");
  const revenueIndex = readRequiredIndex(indexes, "revenue");
  const targetIndex = readRequiredIndex(indexes, "target");
  const recommendationIndex = readRequiredIndex(indexes, "recommendation");

  let totalRevenue = 0;
  let totalTarget = 0;
  const recommendations: string[] = [];
  const seenRecommendations = new Set<string>();
  const rows = Object.freeze(
    snapshot.rows.map((row, rowIndex) => {
      const region = readString(row, regionIndex, "region");
      const revenue = readNumber(row, revenueIndex, "revenue");
      const target = readNumber(row, targetIndex, "target");
      const recommendation = readString(
        row,
        recommendationIndex,
        "recommendation"
      ).trim();

      totalRevenue = addFinite(totalRevenue, revenue, "revenue", rowIndex + 1);
      totalTarget = addFinite(totalTarget, target, "target", rowIndex + 1);
      if (
        recommendation.length > 0 &&
        !seenRecommendations.has(recommendation)
      ) {
        if (recommendations.length === 6) {
          throw new Error(
            "Executive-report binding accepts at most 6 unique recommendations."
          );
        }
        seenRecommendations.add(recommendation);
        recommendations.push(recommendation);
      }

      return Object.freeze({ cells: Object.freeze([region, revenue, target]) });
    })
  );
  if (recommendations.length === 0) {
    throw new Error(
      "Executive-report binding requires at least one non-blank recommendation."
    );
  }

  const metrics = Object.freeze([
    Object.freeze({ label: "Total revenue", value: totalRevenue.toFixed(2) }),
    Object.freeze({ label: "Total target", value: totalTarget.toFixed(2) }),
  ]);
  const columns = Object.freeze([
    Object.freeze({ key: "region", label: "Region", align: "left" }),
    Object.freeze({ key: "revenue", label: "Revenue", align: "right" }),
    Object.freeze({ key: "target", label: "Target", align: "right" }),
  ]);
  const table = Object.freeze({
    columns,
    rows,
  });

  return Object.freeze({
    title: "Executive revenue report",
    summary: `${snapshot.rows.length} regions captured at ${snapshot.capturedAt}.`,
    metrics,
    table,
    recommendations: Object.freeze([...recommendations]),
  });
}

export type ExecutiveReportProps = ReturnType<typeof bindExecutiveReport>;
