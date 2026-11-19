import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_SPLIT_SOURCE_BYTES,
  fileSizeCapMb,
  fileTooLargeMessage,
  splitSourceTooLargeMessage,
} from "../../src/materials/materialUploadLimits";

describe("materialUploadLimits", () => {
  it("exposes 50MB cap", () => {
    expect(MAX_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(fileSizeCapMb()).toBe(50);
    expect(fileTooLargeMessage()).toMatch(/50MB/);
  });

  it("exposes 200MB split-source ceiling", () => {
    expect(MAX_SPLIT_SOURCE_BYTES).toBe(200 * 1024 * 1024);
    expect(fileSizeCapMb(MAX_SPLIT_SOURCE_BYTES)).toBe(200);
    expect(splitSourceTooLargeMessage()).toMatch(/200MB/);
    expect(splitSourceTooLargeMessage()).toMatch(/PDF/);
    expect(splitSourceTooLargeMessage(undefined, "pptx")).toMatch(/PPTX/);
    expect(splitSourceTooLargeMessage(undefined, "pptx")).toMatch(/200MB/);
  });
});
