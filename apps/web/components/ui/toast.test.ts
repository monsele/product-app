import { describe, expect, it } from "vitest";
import { getDefaultDuration, toast } from "./toast-provider";

describe("toast helper API", () => {

  it("provides success, error, warning, and info helper functions", () => {
    expect(typeof toast.success).toBe("function");
    expect(typeof toast.error).toBe("function");
    expect(typeof toast.warning).toBe("function");
    expect(typeof toast.info).toBe("function");
    expect(typeof toast.dismiss).toBe("function");
  });

  it("provides the pending-action helpers used by submit flows", () => {
    expect(typeof toast.loading).toBe("function");
    expect(typeof toast.update).toBe("function");
    expect(typeof toast.promise).toBe("function");
  });

  it("handles calls safely even if provider is unmounted", () => {
    expect(() => {
      toast.success("Success message");
      toast.error("Error message");
      toast.warning("Warning message");
      toast.info("Info message");
      toast.loading("Loading message");
      toast.update("some-id", "success", "Updated message");
      toast.dismiss("some-id");
      toast.dismiss();
    }).not.toThrow();
  });
});

describe("getDefaultDuration", () => {
  it("keeps a loading toast on screen until its action resolves", () => {
    expect(getDefaultDuration("loading")).toBe(0);
  });

  it("gives failures more reading time than confirmations", () => {
    expect(getDefaultDuration("error")).toBeGreaterThan(
      getDefaultDuration("success"),
    );
    expect(getDefaultDuration("warning")).toBeGreaterThan(
      getDefaultDuration("info"),
    );
  });
});

describe("toast.promise", () => {
  it("resolves to the value the wrapped action returned", async () => {
    await expect(
      toast.promise(Promise.resolve("saved"), {
        loading: "Saving...",
        success: "Saved.",
        error: "Could not save.",
      }),
    ).resolves.toBe("saved");
  });

  it("accepts a lazy function as the unit of work", async () => {
    await expect(
      toast.promise(() => Promise.resolve(42), {
        loading: "Working...",
        success: (value) => `Done: ${value}`,
        error: "Failed.",
      }),
    ).resolves.toBe(42);
  });

  it("re-throws so callers can still run their own error handling", async () => {
    const failure = new Error("network down");
    await expect(
      toast.promise(Promise.reject(failure), {
        loading: "Saving...",
        success: "Saved.",
        error: (thrown) => (thrown as Error).message,
      }),
    ).rejects.toBe(failure);
  });
});
