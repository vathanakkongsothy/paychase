PRAGMA defer_foreign_keys=ON;

CREATE TABLE "PilotCampaign" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'mixed',
  "budgetCents" INTEGER NOT NULL DEFAULT 15000,
  "spendCents" INTEGER NOT NULL DEFAULT 0,
  "startsAt" DATETIME,
  "endsAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  "revenueCents" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  PRIMARY KEY ("id")
);

CREATE TABLE "PilotLead" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT,
  "fullName" TEXT NOT NULL,
  "businessName" TEXT,
  "email" TEXT,
  "contactMethod" TEXT NOT NULL,
  "contactValue" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "monthlyInvoices" TEXT NOT NULL,
  "overdueAmount" TEXT NOT NULL,
  "followUpMethod" TEXT NOT NULL,
  "willingnessToPay" TEXT NOT NULL,
  "preferredLanguage" TEXT NOT NULL DEFAULT 'km',
  "notes" TEXT,
  "qualificationScore" INTEGER NOT NULL DEFAULT 0,
  "stage" TEXT NOT NULL DEFAULT 'NEW',
  "stageUpdatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "consentVersion" TEXT NOT NULL,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  "utmTerm" TEXT,
  "landingPath" TEXT,
  "referrer" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("campaignId") REFERENCES "PilotCampaign" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  PRIMARY KEY ("id"),
  CHECK ("stage" IN ('NEW', 'CONTACTED', 'QUALIFIED', 'DEMO_SCHEDULED', 'PILOT', 'PAID', 'LOST'))
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "companyName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "paymentBehavior" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK ("paymentBehavior" IN ('USUALLY_ON_TIME', 'SOMETIMES_LATE', 'FREQUENTLY_LATE', 'UNKNOWN'))
);

CREATE TABLE "PilotLeadEvent" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  FOREIGN KEY ("leadId") REFERENCES "PilotLead" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY ("id"),
  CHECK ("type" IN ('LEAD_SUBMITTED', 'CONTACTED', 'QUALIFIED', 'DEMO_SCHEDULED', 'PILOT_STARTED', 'PAID', 'LOST')),
  CHECK ("metadata" IS NULL OR json_valid("metadata"))
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT,
  "invoiceNumber" TEXT NOT NULL,
  "issueDate" DATETIME,
  "dueDate" DATETIME,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" INTEGER,
  "tax" INTEGER,
  "totalAmount" INTEGER NOT NULL,
  "amountOutstanding" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "daysOverdue" INTEGER NOT NULL DEFAULT 0,
  "priorityScore" INTEGER NOT NULL DEFAULT 0,
  "purchaseOrderRef" TEXT,
  "sourceFileUrl" TEXT,
  "sourceFileName" TEXT,
  "sourceMimeType" TEXT,
  "notes" TEXT,
  "lastFollowUpAt" DATETIME,
  "nextFollowUpAt" DATETIME,
  "paidAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK ("status" IN ('DRAFT', 'SENT', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'PROMISED', 'DISPUTED', 'PAID', 'WRITTEN_OFF'))
);

CREATE TABLE "FollowUp" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "tone" TEXT,
  "subject" TEXT,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sentAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY ("id"),
  CHECK ("type" IN ('REMINDER', 'NOTE', 'PROMISE', 'STATUS_CHANGE')),
  CHECK ("tone" IN ('FRIENDLY', 'PROFESSIONAL', 'FIRM')),
  CHECK ("status" IN ('DRAFT', 'SENT', 'CANCELLED'))
);

CREATE TABLE "InvoiceEvent" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY ("id"),
  CHECK ("type" IN ('INVOICE_UPLOADED', 'INVOICE_EXTRACTED', 'INVOICE_CORRECTED', 'INVOICE_SAVED', 'REMINDER_GENERATED', 'REMINDER_SENT', 'NOTE_ADDED', 'PROMISE_RECORDED', 'PROMISE_MISSED', 'FOLLOW_UP_SCHEDULED', 'MARKED_DISPUTED', 'MARKED_PAID', 'MARKED_WRITTEN_OFF', 'STATUS_CHANGED')),
  CHECK ("metadata" IS NULL OR json_valid("metadata"))
);

CREATE TABLE "InvoiceExtraction" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "extractedData" TEXT NOT NULL,
  "confidenceData" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY ("id"),
  CHECK ("extractedData" IS NULL OR json_valid("extractedData")),
  CHECK ("confidenceData" IS NULL OR json_valid("confidenceData"))
);

CREATE TABLE "PaymentPromise" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "promisedDate" DATETIME NOT NULL,
  "promisedAmount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY ("id"),
  CHECK ("status" IN ('ACTIVE', 'KEPT', 'MISSED', 'CANCELLED'))
);

CREATE INDEX "Customer_workspaceId_idx" ON "Customer" ("workspaceId");

CREATE INDEX "Customer_workspaceId_name_idx" ON "Customer" ("workspaceId", "name");

CREATE INDEX "FollowUp_invoiceId_idx" ON "FollowUp" ("invoiceId");

CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent" ("invoiceId", "createdAt");

CREATE INDEX "InvoiceExtraction_invoiceId_idx" ON "InvoiceExtraction" ("invoiceId");

CREATE INDEX "Invoice_customerId_idx" ON "Invoice" ("customerId");

CREATE INDEX "Invoice_dueDate_idx" ON "Invoice" ("dueDate");

CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice" ("workspaceId");

CREATE INDEX "Invoice_workspaceId_priorityScore_idx" ON "Invoice" ("workspaceId", "priorityScore");

CREATE INDEX "Invoice_workspaceId_status_idx" ON "Invoice" ("workspaceId", "status");

CREATE INDEX "PaymentPromise_invoiceId_idx" ON "PaymentPromise" ("invoiceId");

CREATE INDEX "PaymentPromise_promisedDate_status_idx" ON "PaymentPromise" ("promisedDate", "status");

CREATE UNIQUE INDEX "PilotCampaign_slug_key" ON "PilotCampaign" ("slug");

CREATE INDEX "PilotLeadEvent_leadId_createdAt_idx" ON "PilotLeadEvent" ("leadId", "createdAt");

CREATE INDEX "PilotLead_campaignId_idx" ON "PilotLead" ("campaignId");

CREATE INDEX "PilotLead_contactValue_idx" ON "PilotLead" ("contactValue");

CREATE INDEX "PilotLead_email_idx" ON "PilotLead" ("email");

CREATE INDEX "PilotLead_stage_createdAt_idx" ON "PilotLead" ("stage", "createdAt");

CREATE INDEX "Session_expiresAt_idx" ON "Session" ("expiresAt");

CREATE UNIQUE INDEX "Session_token_key" ON "Session" ("token");

CREATE INDEX "Session_userId_idx" ON "Session" ("userId");

CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");
