import { describe, expect, it } from "vitest";
import { checkPassword, isCronAuthorized, isValidSession, safeEqual, sessionToken } from "@/lib/auth";

describe("auth", () => {
  it("compares strings safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  it("checks the dashboard password", () => {
    expect(checkPassword("secret", "secret")).toBe(true);
    expect(checkPassword("wrong", "secret")).toBe(false);
  });

  it("derives a session token that changes with the password", () => {
    const token = sessionToken("secret");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain("secret");
    expect(isValidSession(token, "secret")).toBe(true);
    expect(isValidSession(token, "new-password")).toBe(false);
    expect(isValidSession(undefined, "secret")).toBe(false);
  });

  it("accepts only the right bearer token for cron", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(isCronAuthorized("bearer s3cret", "s3cret")).toBe(true);
    expect(isCronAuthorized("Bearer nope", "s3cret")).toBe(false);
    expect(isCronAuthorized("s3cret", "s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret")).toBe(false);
  });
});
