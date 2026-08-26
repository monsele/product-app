import { describe, expect, it } from "vitest";
import { formatBytes, validationMessage } from "./source-upload-form";

describe("source upload form helpers", () => {
  it("formats byte sizes accurately for human reading", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
    expect(formatBytes(1024 * 1024 * 20)).toBe("20 MB");
  });

  it("maps validation error codes to clear plain-language messages", () => {
    expect(validationMessage("EMPTY_FILE")).toContain("empty");
    expect(validationMessage("FILE_TOO_LARGE")).toContain("25 MB");
    expect(validationMessage("UNSUPPORTED_FILE_TYPE")).toContain("PDF and DOCX");
    expect(validationMessage("PAGE_LIMIT_EXCEEDED")).toContain("20 pages");
    expect(validationMessage("MALWARE_DETECTED")).toContain("safety check");
    expect(validationMessage("CORRUPT_DOCUMENT")).toContain("could not be read");
    expect(validationMessage("DOCUMENT_INSPECTION_UNAVAILABLE")).toContain("inspected");
    expect(validationMessage(null)).toContain("could not be validated");
  });
});
