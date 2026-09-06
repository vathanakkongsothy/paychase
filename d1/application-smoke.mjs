import { execFile } from "node:child_process";
import { unstable_dev } from "wrangler";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nativeOnly = process.argv.includes("--native");
const config = nativeOnly ? "d1/native-runtime.wrangler.jsonc" : "wrangler.d1.jsonc";
const entry = nativeOnly ? "d1/native-runtime-worker.ts" : ".open-next/worker.js";
const persistTo = join(root, nativeOnly ? ".d1-build/native-worker-state" : ".d1-build/application-worker-state");
const nonce = randomUUID();
const password = "d1-runtime-test-password";
const passwordHash = await hash(password, 12);
const userId = `smoke-user-${nonce}`;
const workspaceId = `smoke-workspace-${nonce}`;
const invoiceId = `smoke-invoice-${nonce}`;
const sessionToken = `smoke-token-${nonce}`;
const now = new Date().toISOString().replace("Z", "+00:00");
const execute = promisify(execFile);
async function localSql(sql) {
  await execute(process.execPath, [
    join(root, "node_modules/wrangler/bin/wrangler.js"),
    "d1", "execute", "D1_DB", "--config", config, "--local", "--persist-to", persistTo, "--command", sql,
  ], { cwd: root, windowsHide: true, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" } });
}
await execute(process.execPath, [
  join(root, "node_modules/wrangler/bin/wrangler.js"),
  "d1", "migrations", "apply", "D1_DB", "--config", config, "--local", "--persist-to", persistTo,
], { cwd: root, windowsHide: true, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" } });
await localSql(`
  INSERT INTO "User" ("id","email","name","passwordHash","createdAt","updatedAt")
  VALUES ('${userId}','${nonce}@smoke.invalid','D1 smoke','${passwordHash}','${now}','${now}');
  INSERT INTO "Workspace" ("id","name","ownerId") VALUES ('${workspaceId}','D1 smoke','${userId}');
  INSERT INTO "Session" ("id","userId","token","expiresAt")
  VALUES ('smoke-session-${nonce}','${userId}','${sessionToken}','2099-01-01T00:00:00.000+00:00');
  INSERT INTO "Invoice" ("id","workspaceId","invoiceNumber","totalAmount","amountOutstanding","status","updatedAt")
  VALUES ('${invoiceId}','${workspaceId}','D1 smoke',29,29,'SENT','${now}');
`);
let worker;
try {
  worker = await unstable_dev(entry, {
    config, local: true, ip: "127.0.0.1", port: 0, persistTo, logLevel: "warn",
    vars: { CORE_API_URL: "", CORE_APP_ID: "", CORE_REQUEST_SECRET: "" },
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, forceLocal: true, watch: false },
  });
  const port = worker.port;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(10000), headers: { connection: "close" },
  });
  assert.equal(response.status, 200, "D1 schema health failed");
  assert.deepEqual(await response.json(), {
    ok: true,
    product: "PayChase",
    database: "ok",
    backend: "d1",
  });
  const protectedResponse = await fetch(`http://127.0.0.1:${port}/api/invoices`, {
    signal: AbortSignal.timeout(5000),
    headers: { connection: "close" },
  });
  assert.equal(protectedResponse.status, 401, "Application must require an authenticated D1 session");
  const write = await fetch(`http://127.0.0.1:${port}/api/health`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { connection: "close" },
  });
  assert.equal(write.status, 404, "Unknown health write route must be rejected");
  async function request(path, method = "GET", body) {
    return fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, signal: AbortSignal.timeout(10000),
      headers: { connection: "close", cookie: `pc_session=${sessionToken}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const login = await request("/auth/login", "POST", { email: `${nonce}@smoke.invalid`, password });
  assert.equal(login.status, 200, "D1 password login failed");
  const loginCookie = login.headers.get("set-cookie");
  assert.ok(loginCookie?.includes("pc_session="), "D1 login did not issue a session");
  const me = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    signal: AbortSignal.timeout(10000), headers: { connection: "close", cookie: loginCookie.split(";")[0] },
  });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.id, userId);
  const initial = await request(`/invoices/${invoiceId}`);
  assert.equal(initial.status, 200, "Authenticated invoice read failed");
  assert.equal((await initial.json()).amountOutstanding, 0.29, "Stored integer cents changed at the API boundary");
  const corrected = await request(`/invoices/${invoiceId}/correct`, "PATCH", {
    invoiceNumber: "D1 smoke corrected", customerName: "D1 smoke customer", totalAmount: "10.01", amountOutstanding: "10.01",
  });
  assert.equal(corrected.status, 200, "D1 invoice correction failed");
  assert.equal((await corrected.json()).totalAmount, 10.01);
  const promised = await request(`/invoices/${invoiceId}/promise`, "POST", {
    promisedDate: "2098-01-01", promisedAmount: "10.01",
  });
  assert.equal(promised.status, 200, "Atomic promise creation failed");
  assert.equal((await promised.json()).promise.promisedAmount, 10.01);
  const paid = await request(`/invoices/${invoiceId}/mark-paid`, "POST");
  assert.equal(paid.status, 200, "Atomic payment transition failed");
  const paidResult = await paid.json();
  assert.equal(paidResult.status, "PAID");
  assert.equal(paidResult.amountOutstanding, 0);
  assert.equal(paidResult.promises[0].status, "KEPT");
  const replayed = await request(`/invoices/${invoiceId}/mark-paid`, "POST");
  assert.equal(replayed.status, 200, "Payment replay failed");
  const replayResult = await replayed.json();
  assert.equal(replayResult.paidAt, paidResult.paidAt, "Replay changed the payment timestamp");
  assert.equal(replayResult.events.filter((event) => event.type === "MARKED_PAID").length, 1, "Replay duplicated the payment event");
  assert.equal((await request(`/invoices/${invoiceId}/mark-disputed`, "POST")).status, 409, "Paid invoices must not reopen");
  const dashboard = await request("/dashboard");
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).metrics.outstanding, 0);
  console.log(
    `${nativeOnly ? "Native D1" : "Full OpenNext D1"} Worker login, authenticated reads, corrections, promises, payment replay, and reporting checks passed`,
  );
} finally {
  await worker?.stop();
  await localSql(`
    DELETE FROM "Invoice" WHERE "workspaceId"='${workspaceId}';
    DELETE FROM "Workspace" WHERE "id"='${workspaceId}' AND "ownerId"='${userId}';
    DELETE FROM "User" WHERE "id"='${userId}';
  `);
}
