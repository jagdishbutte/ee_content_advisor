import { describe, expect, it } from "vitest";
import { sources } from "@/config/sources";

describe("sources config", () => {
  it("has unique ids", () => {
    const ids = sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps authority within 1-5", () => {
    for (const s of sources) {
      expect(s.authority).toBeGreaterThanOrEqual(1);
      expect(s.authority).toBeLessThanOrEqual(5);
    }
  });
});
