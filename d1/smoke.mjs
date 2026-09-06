import { unstable_dev } from "wrangler";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const worker = await unstable_dev("d1/worker.ts", {
  config: "d1/wrangler.jsonc", local: true, ip: "127.0.0.1", port: 0,
  persistTo: join(root, "d1/.wrangler/state"), logLevel: "warn",
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, forceLocal: true, watch: false },
});
try {
  const response = await fetch(`http://127.0.0.1:${worker.port}/health`, {
    signal: AbortSignal.timeout(10000), headers: { connection: "close" },
  });
  assert.equal(response.status, 200, "D1 schema health failed");
  assert.deepEqual(await response.json(), {
    status: "ok", schema: "ok", applicationReady: false,
  });
  const write = await fetch(`http://127.0.0.1:${worker.port}/health`, {
    method: "POST", signal: AbortSignal.timeout(5000), headers: { connection: "close" },
  });
  assert.equal(write.status, 404, "Preflight must not expose a write endpoint");
  console.log("Local D1 Worker health passed; application readiness remains false and writes are rejected");
} finally {
  await worker.stop();
}
