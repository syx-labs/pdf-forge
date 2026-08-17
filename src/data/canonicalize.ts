import { createHash } from "node:crypto";
import type { DataSnapshot } from "./types.js";

type JsonScalar = string | number | boolean | null;

function compareCodePoints(left: string, right: string): number {
  const leftCodePoints = Array.from(
    left,
    (character) => character.codePointAt(0) ?? -1
  );
  const rightCodePoints = Array.from(
    right,
    (character) => character.codePointAt(0) ?? -1
  );
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftCodePoints[index] - rightCodePoints[index];
    if (difference !== 0) {
      return difference;
    }
  }

  return leftCodePoints.length - rightCodePoints.length;
}

function serializeScalar(value: JsonScalar): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Data snapshot contains an unsupported JSON value.");
  }
  return serialized;
}

function canonicalizeValue(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Data snapshot contains a non-finite number.");
    }
    return serializeScalar(value);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return serializeScalar(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort(compareCodePoints)
      .map(
        (key) =>
          `${serializeScalar(key)}:${canonicalizeValue(Reflect.get(value, key))}`
      );
    return `{${entries.join(",")}}`;
  }

  throw new TypeError("Data snapshot contains an unsupported JSON value.");
}

export function canonicalizeDataSnapshot(snapshot: DataSnapshot): string {
  return canonicalizeValue(snapshot);
}

export function hashDataSnapshot(snapshot: DataSnapshot): string {
  return createHash("sha256")
    .update(canonicalizeDataSnapshot(snapshot), "utf8")
    .digest("hex");
}
