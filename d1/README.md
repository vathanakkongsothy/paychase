# PayChase: Neon to D1

The complete D1 application runtime is in src/server/d1. The real Next API route selects it only when the Worker variable DATABASE_BACKEND is exactly d1. An absent flag or neon keeps the existing Neon implementation. Invalid flags fail closed.

## Runtime behavior

D1 uses its native prepared statements. All multi-row changes use an atomic DB.batch: signup and compensation, password/session changes, upload/customer/extraction/events, invoice corrections, reminders and notes, promises, and payment status. Payment and reminder replay produces one transition event. Every child mutation is scoped to its parent invoice and workspace. A monotonic invoice revision prevents stale derived fields or corrections from undoing newer writes.

The five money fields are integer cents. Input accepts finite numbers or decimal strings, rejects fractional cents and values outside NUMERIC(12,2), and stores exact integers. Reports sum integer cents before converting at the JSON boundary. Timestamps use UTC ISO strings ending +00:00. Imported JSON is decoded at read boundaries. Prisma's separate generated D1 client supplies types only; no Prisma transaction adapter runs on D1.

## Local validation (Node 22.13+)

Install using pnpm install. Then run:

    pnpm db:d1:generate
    pnpm db:d1:validate
    pnpm test:d1
    pnpm db:d1:app:smoke:native
    pnpm exec tsc --noEmit
    pnpm db:d1:app:migrate:local
    pnpm build:d1
    pnpm preview:d1

The native smoke runs the same D1 application router in a local Worker with a private synthetic database and no Core calls. It validates password login, sessions, invoices, promises, payment replay and reporting. The full OpenNext build and application smoke remain required before deployment.

The candidate Worker configuration wrangler.d1.jsonc serves the real application with DATABASE_BACKEND=d1 and D1_DB. It has no production routes. The preflight under d1/wrangler.jsonc remains a schema-only diagnostic; its applicationReady:false response is intentionally not an application acceptance test.

CI applies the migrations to SQLite, exercises actual authenticated API routes and failure rollback, checks both generated schemas, types, local Wrangler migration and preflight, then builds the full OpenNext application, dry-runs its candidate Worker, and checks authenticated reads, exact cents, corrections, promises, payment replay, and reporting through that local Worker. The smoke creates uniquely named local records and removes them afterward. No remote migration or deployment runs from this validation workflow. The master deployment calls it as a reusable workflow and waits for success before configuring Cloudflare credentials or deploying. Both jobs check out the triggering commit SHA. PR validation does not trigger a production deployment.

The existing Neon implementation and its dependencies remain available during rollout. Remove that fallback only after the D1 cutover and reconciliation period.

## Controlled production cutover

Merging or deploying this PR leaves DATABASE_BACKEND unset, so traffic continues to Neon. The D1_DB binding initially identifies paychase-neon-d1, a static migration snapshot. **Do not enable the flag against that stale snapshot.**

1. Confirm the deployed application source matches the reviewed PR source. The baseline preserves three pilot tables that are absent from the current master application schema. Reconcile any deployed or uncommitted pilot features before cutover; this PR does not replace those user edits. Rehearse against a fresh, empty D1 database. Apply all SQL in d1/migrations, including the runtime revision migration.
2. Pause application writes and drain jobs/webhooks. Export a fresh Neon snapshot, transform/import data only, and verify all source rows, scaled values, timestamps, foreign keys and integrity. Never apply the baseline to a populated database without migration history.
3. Run the read-only d1/cutover-readiness.sql against the new database and check its integrity, row counts, representations, runtime revision and tenant/payment invariants. Then run node d1/prepare-cutover.mjs VERIFIED_FRESH_D1_UUID DATABASE_NAME to update D1_DB and DATABASE_BACKEND in both Worker configurations. Review and commit those changes so future master deployments keep D1 selected. Validate login, upload, corrections, reporting, promises, and repeated mark-paid requests against the candidate.
4. Explicitly set DATABASE_BACKEND=d1 on the production Worker and deploy the reviewed build. Verify /api/health reports backend:d1 and run the acceptance checks before resuming writes.
5. Retain Neon. Before any D1 writes, rollback is DATABASE_BACKEND=neon; after D1 accepts writes, pause and reconcile them into Neon before rollback.

Only schema and code are committed. Customer snapshots, credentials, and imports remain private.
