import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  fileSizeCapMb,
  fileTooLargeMessage,
} from "../../src/lib/materialUploadLimits";

describe("materialUploadLimits", () => {
  it("exposes 50MB cap", () => {
    expect(MAX_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(fileSizeCapMb()).toBe(50);
    expect(fileTooLargeMessage()).toMatch(/50MB/);
  });
});
