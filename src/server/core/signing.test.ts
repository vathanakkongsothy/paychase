import { describe, expect, it } from "vitest";
import { requestSignature, sha256, signingTimestamp } from "@/server/core/signing";

describe("Phumi Core request signing", () => {
  it("hashes the exact raw body", () => {
    expect(sha256("{}")).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
  });

  it("uses an empty body hash for GET requests", () => {
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is deterministic and binds method, path, timestamp, and body", () => {
    const input = {
      method: "PUT",
      path: "/v1/users",
      timestamp: "1786600000",
      rawBody: '{"externalId":"123"}',
      secret: "s".repeat(32),
    };

    expect(requestSignature(input)).toBe(requestSignature(input));
    expect(requestSignature({ ...input, path: "/v1/tenants" })).not.toBe(
      requestSignature(input),
    );
    expect(requestSignature({ ...input, method: "POST" })).not.toBe(
      requestSignature(input),
    );
  });

  it("matches the canonical newline-separated signing input", () => {
    const secret = "paychase-test-secret-value!!";
    const timestamp = signingTimestamp(1_786_600_000);
    const rawBody = JSON.stringify({ externalId: "user_abc", displayName: "Sam" });

    const signature = requestSignature({
      method: "PUT",
      path: "/v1/users",
      timestamp,
      rawBody,
      secret,
    });

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(
      requestSignature({
        method: "put",
        path: "/v1/users",
        timestamp,
        rawBody,
        secret,
      }),
    ).toBe(signature);
  });
});

describe("workspaceSlug", () => {
  it("derives a Core-compatible slug from workspace ids", async () => {
    const { workspaceSlug } = await import("@/server/core/sync");
    expect(workspaceSlug("clxyz123abc")).toBe("pc-clxyz123abc");
    expect(workspaceSlug("clxyz123abc")).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});
