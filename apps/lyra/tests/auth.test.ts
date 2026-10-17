import { describe, expect, it } from "vitest";
import { authenticate, assertSameOrigin } from "@citadel/auth";

describe("authentication boundaries", () => {
  it("only enables the development identity on loopback in local mode", async () => {
    const local = { APP_ENV: "local", LOCAL_AUTH_BYPASS: "true" };
    await expect(authenticate(new Request("http://127.0.0.1:5173/"), local)).resolves.toMatchObject(
      { subject: "local-owner" },
    );
    await expect(
      authenticate(new Request("https://lyra.example.com/"), local),
    ).rejects.toBeInstanceOf(Response);
    await expect(
      authenticate(new Request("http://localhost/"), { ...local, APP_ENV: "production" }),
    ).rejects.toBeInstanceOf(Response);
  });
  it("requires a signed token instead of trusting an email header", async () => {
    await expect(
      authenticate(
        new Request("https://lyra.example.com/", {
          headers: { "cf-access-authenticated-user-email": "owner@example.com" },
        }),
        { APP_ENV: "production", ALLOWED_EMAIL: "owner@example.com" },
      ),
    ).rejects.toBeInstanceOf(Response);
  });
  it("rejects cross-origin mutations", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://lyra.example.com/api/conversations", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://lyra.example.com/api/conversations", {
          method: "POST",
          headers: { origin: "https://lyra.example.com" },
        }),
      ),
    ).not.toThrow();
  });
});
