import { createHash, createHmac } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function requestSignature(input: {
  method: string;
  path: string;
  timestamp: string;
  rawBody: string;
  secret: string;
}): string {
  const canonical = [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    sha256(input.rawBody),
  ].join("\n");
  return createHmac("sha256", input.secret).update(canonical).digest("hex");
}

export function signingTimestamp(unixSeconds: number = Math.floor(Date.now() / 1000)): string {
  return String(unixSeconds);
}
