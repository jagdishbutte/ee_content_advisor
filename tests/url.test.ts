import { describe, expect, it } from "vitest";
import { normalizeUrl } from "@/lib/url";

describe("normalizeUrl", () => {
  it("strips tracking params, www, fragment and trailing slash", () => {
    expect(normalizeUrl("http://www.Example.com/a/b/?utm_source=x&utm_medium=y&id=3#top")).toBe("https://example.com/a/b?id=3");
  });

  it("sorts remaining params", () => {
    expect(normalizeUrl("https://example.com/p?b=2&a=1&fbclid=z")).toBe("https://example.com/p?a=1&b=2");
  });

  it("normalises a bare host", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("returns invalid input unchanged", () => {
    expect(normalizeUrl(" not a url ")).toBe("not a url");
  });
});
