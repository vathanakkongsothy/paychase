-- Read-only checks for a freshly imported production candidate.
-- Compare row counts and complete row contents with the private fresh-source verification.
PRAGMA foreign_key_check;
PRAGMA integrity_check;

SELECT 'PilotCampaign' AS table_name, count(*) AS row_count FROM "PilotCampaign"
UNION ALL
SELECT 'User' AS table_name, count(*) AS row_count FROM "User"
UNION ALL
SELECT 'PilotLead' AS table_name, count(*) AS row_count FROM "PilotLead"
UNION ALL
SELECT 'Session' AS table_name, count(*) AS row_count FROM "Session"
UNION ALL
SELECT 'Workspace' AS table_name, count(*) AS row_count FROM "Workspace"
UNION ALL
SELECT 'Customer' AS table_name, count(*) AS row_count FROM "Customer"
UNION ALL
SELECT 'PilotLeadEvent' AS table_name, count(*) AS row_count FROM "PilotLeadEvent"
UNION ALL
SELECT 'Invoice' AS table_name, count(*) AS row_count FROM "Invoice"
UNION ALL
SELECT 'FollowUp' AS table_name, count(*) AS row_count FROM "FollowUp"
UNION ALL
SELECT 'InvoiceEvent' AS table_name, count(*) AS row_count FROM "InvoiceEvent"
UNION ALL
SELECT 'InvoiceExtraction' AS table_name, count(*) AS row_count FROM "InvoiceExtraction"
UNION ALL
SELECT 'PaymentPromise' AS table_name, count(*) AS row_count FROM "PaymentPromise";

SELECT count(*) AS runtime_revision_columns FROM pragma_table_info('Invoice') WHERE name='d1Revision' AND type='INTEGER';

SELECT 'Invoice.subtotal' AS numeric_field, count(*) AS invalid_rows FROM "Invoice" WHERE "subtotal" IS NOT NULL AND (typeof("subtotal")<>'integer' OR "subtotal" < -999999999999 OR "subtotal" > 999999999999)
UNION ALL
SELECT 'Invoice.tax' AS numeric_field, count(*) AS invalid_rows FROM "Invoice" WHERE "tax" IS NOT NULL AND (typeof("tax")<>'integer' OR "tax" < -999999999999 OR "tax" > 999999999999)
UNION ALL
SELECT 'Invoice.totalAmount' AS numeric_field, count(*) AS invalid_rows FROM "Invoice" WHERE "totalAmount" IS NOT NULL AND (typeof("totalAmount")<>'integer' OR "totalAmount" < -999999999999 OR "totalAmount" > 999999999999)
UNION ALL
SELECT 'Invoice.amountOutstanding' AS numeric_field, count(*) AS invalid_rows FROM "Invoice" WHERE "amountOutstanding" IS NOT NULL AND (typeof("amountOutstanding")<>'integer' OR "amountOutstanding" < -999999999999 OR "amountOutstanding" > 999999999999)
UNION ALL
SELECT 'PaymentPromise.promisedAmount' AS numeric_field, count(*) AS invalid_rows FROM "PaymentPromise" WHERE "promisedAmount" IS NOT NULL AND (typeof("promisedAmount")<>'integer' OR "promisedAmount" < -999999999999 OR "promisedAmount" > 999999999999);

SELECT 'PilotCampaign.startsAt' AS timestamp_field, count(*) AS invalid_rows FROM "PilotCampaign" WHERE "startsAt" IS NOT NULL AND (typeof("startsAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "startsAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "startsAt") <> "startsAt")
UNION ALL
SELECT 'PilotCampaign.endsAt' AS timestamp_field, count(*) AS invalid_rows FROM "PilotCampaign" WHERE "endsAt" IS NOT NULL AND (typeof("endsAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "endsAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "endsAt") <> "endsAt")
UNION ALL
SELECT 'PilotCampaign.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "PilotCampaign" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'PilotCampaign.updatedAt' AS timestamp_field, count(*) AS invalid_rows FROM "PilotCampaign" WHERE "updatedAt" IS NOT NULL AND (typeof("updatedAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") <> "updatedAt")
UNION ALL
SELECT 'User.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "User" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'User.updatedAt' AS timestamp_field, count(*) AS invalid_rows FROM "User" WHERE "updatedAt" IS NOT NULL AND (typeof("updatedAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") <> "updatedAt")
UNION ALL
SELECT 'PilotLead.stageUpdatedAt' AS timestamp_field, count(*) AS invalid_rows FROM "PilotLead" WHERE "stageUpdatedAt" IS NOT NULL AND (typeof("stageUpdatedAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "stageUpdatedAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "stageUpdatedAt") <> "stageUpdatedAt")
UNION ALL
SELECT 'PilotLead.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "PilotLead" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'PilotLead.updatedAt' AS timestamp_field, count(*) AS invalid_rows FROM "PilotLead" WHERE "updatedAt" IS NOT NULL AND (typeof("updatedAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") <> "updatedAt")
UNION ALL
SELECT 'Session.expiresAt' AS timestamp_field, count(*) AS invalid_rows FROM "Session" WHERE "expiresAt" IS NOT NULL AND (typeof("expiresAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "expiresAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "expiresAt") <> "expiresAt")
UNION ALL
SELECT 'Session.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "Session" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'Workspace.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "Workspace" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'Customer.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "Customer" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'Customer.updatedAt' AS timestamp_field, count(*) AS invalid_rows FROM "Customer" WHERE "updatedAt" IS NOT NULL AND (typeof("updatedAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") <> "updatedAt")
UNION ALL
SELECT 'PilotLeadEvent.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "PilotLeadEvent" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'Invoice.issueDate' AS timestamp_field, count(*) AS invalid_rows FROM "Invoice" WHERE "issueDate" IS NOT NULL AND (typeof("issueDate")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "issueDate") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "issueDate") <> "issueDate")
UNION ALL
SELECT 'Invoice.dueDate' AS timestamp_field, count(*) AS invalid_rows FROM "Invoice" WHERE "dueDate" IS NOT NULL AND (typeof("dueDate")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "dueDate") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "dueDate") <> "dueDate")
UNION ALL
SELECT 'Invoice.lastFollowUpAt' AS timestamp_field, count(*) AS invalid_rows FROM "Invoice" WHERE "lastFollowUpAt" IS NOT NULL AND (typeof("lastFollowUpAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "lastFollowUpAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "lastFollowUpAt") <> "lastFollowUpAt")
UNION ALL
SELECT 'Invoice.nextFollowUpAt' AS timestamp_field, count(*) AS invalid_rows FROM "Invoice" WHERE "nextFollowUpAt" IS NOT NULL AND (typeof("nextFollowUpAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "nextFollowUpAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "nextFollowUpAt") <> "nextFollowUpAt")
UNION ALL
SELECT 'Invoice.paidAt' AS timestamp_field, count(*) AS invalid_rows FROM "Invoice" WHERE "paidAt" IS NOT NULL AND (typeof("paidAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "paidAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "paidAt") <> "paidAt")
UNION ALL
SELECT 'Invoice.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "Invoice" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'Invoice.updatedAt' AS timestamp_field, count(*) AS invalid_rows FROM "Invoice" WHERE "updatedAt" IS NOT NULL AND (typeof("updatedAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") <> "updatedAt")
UNION ALL
SELECT 'FollowUp.sentAt' AS timestamp_field, count(*) AS invalid_rows FROM "FollowUp" WHERE "sentAt" IS NOT NULL AND (typeof("sentAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "sentAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "sentAt") <> "sentAt")
UNION ALL
SELECT 'FollowUp.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "FollowUp" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'InvoiceEvent.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "InvoiceEvent" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'InvoiceExtraction.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "InvoiceExtraction" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'PaymentPromise.promisedDate' AS timestamp_field, count(*) AS invalid_rows FROM "PaymentPromise" WHERE "promisedDate" IS NOT NULL AND (typeof("promisedDate")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "promisedDate") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "promisedDate") <> "promisedDate")
UNION ALL
SELECT 'PaymentPromise.createdAt' AS timestamp_field, count(*) AS invalid_rows FROM "PaymentPromise" WHERE "createdAt" IS NOT NULL AND (typeof("createdAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt") <> "createdAt")
UNION ALL
SELECT 'PaymentPromise.updatedAt' AS timestamp_field, count(*) AS invalid_rows FROM "PaymentPromise" WHERE "updatedAt" IS NOT NULL AND (typeof("updatedAt")<>'text' OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") IS NULL OR strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt") <> "updatedAt");

SELECT count(*) AS cross_workspace_customers FROM "Invoice" i JOIN "Customer" c ON i."customerId"=c."id" WHERE i."workspaceId"<>c."workspaceId";
SELECT count(*) AS paid_with_balance FROM "Invoice" WHERE "status"='PAID' AND "amountOutstanding"<>0;
SELECT count(*) AS duplicate_active_promises FROM (SELECT "invoiceId" FROM "PaymentPromise" WHERE "status"='ACTIVE' GROUP BY "invoiceId" HAVING count(*)>1);
