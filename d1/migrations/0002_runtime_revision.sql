-- Compare-and-swap token for derived fields and invoice corrections.
-- Every runtime invoice mutation increments this value in its atomic D1 batch.
ALTER TABLE "Invoice" ADD COLUMN "d1Revision" INTEGER NOT NULL DEFAULT 0 CHECK ("d1Revision" >= 0);
