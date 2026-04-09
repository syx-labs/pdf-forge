import { describe, test, expect } from "bun:test";
import { formatFileSize } from "../../src/core/utils";

describe("formatFileSize", () => {
  test("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  test("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  test("formats megabytes", () => {
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
