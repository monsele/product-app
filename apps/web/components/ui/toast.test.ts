import { describe, expect, it } from "vitest";
import { toast } from "./toast-provider";

describe("toast helper API", () => {

  it("provides success, error, warning, and info helper functions", () => {
    expect(typeof toast.success).toBe("function");
    expect(typeof toast.error).toBe("function");
    expect(typeof toast.warning).toBe("function");
    expect(typeof toast.info).toBe("function");
    expect(typeof toast.dismiss).toBe("function");
  });

  it("handles calls safely even if provider is unmounted", () => {
    expect(() => {
      toast.success("Success message");
      toast.error("Error message");
      toast.warning("Warning message");
      toast.info("Info message");
      toast.dismiss("some-id");
      toast.dismiss();
    }).not.toThrow();
  });
});
