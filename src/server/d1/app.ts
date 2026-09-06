import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { amount, batch, DataError, money, signedMoney, one, optionalMoney, rows, statement, update, withDatabase, type Database } from "./db";
import type { Customer, Invoice, InvoiceStatus, FollowUpTone } from "./types";
import { invoiceDetails, workspaceInvoices } from "./invoices";
import { addNote, correctInvoice, createReminder, createUploadedInvoice, markDisputed, markPaid, markReminderSent, recordPromise } from "./mutations";
import {
  getInvoiceInWorkspace,
  getWorkspaceForUser,
  inferPaymentBehavior,
  refreshInvoiceDerivedFields,
  serializeInvoice,
  serializePromise,
} from "./invoices";
import { getDashboardMetrics, getReports } from "./analytics";
import { getExtractionProvider, getFollowUpProvider } from "@/server/ai/providers";
import { storeInvoiceFile, readStoredFile } from "@/server/storage";
import { calculateInvoiceStatus } from "@/server/domains/collection/status";


import {
  AuthError,
  changePassword,
  login,
  signup,
  updateProfile,
} from "./auth";
import {
  SESSION_COOKIE,
  cookieOptions,
  destroySession,
  getSessionUser,
} from "./auth";

type AuthUser = { id: string; email: string; name: string };
type AuthWorkspace = { id: string; name: string; ownerId: string };

const app = new Hono<{
  Bindings: { DB: Database };
  Variables: { user: AuthUser; workspace: AuthWorkspace };
}>().basePath("/api");

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/signup",
]);

const OPTIONAL_AUTH_PATHS = new Set(["/api/auth/me", "/api/auth/logout"]);

function apiPath(path: string) {
  return path.startsWith("/api") ? path : `/api${path}`;
}

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  const status =
    "status" in err && typeof err.status === "number" ? err.status : 500;
  if (status >= 400 && status < 500) {
    return c.json({ error: err.message }, status as 400 | 401 | 404 | 409 | 503);
  }
  console.error(err);
  if (String(err).includes("D1") || String(err).includes("SQLITE")) {
    return c.json({ error: "Could not reach the database. Try again shortly." }, 503);
  }
  return c.json({ error: "Something went wrong" }, 500);
});

app.use("*", (c, next) => withDatabase(c.env.DB, () => next()));

app.use("*", async (c, next) => {
  const path = apiPath(c.req.path);
  if (PUBLIC_PATHS.has(path)) {
    return next();
  }

  const session = await getSessionUser(getCookie(c, SESSION_COOKIE));
  if (OPTIONAL_AUTH_PATHS.has(path)) {
    if (session?.workspace) {
      c.set("user", session.user);
      c.set("workspace", session.workspace);
    }
    return next();
  }

  if (!session?.workspace) {
    return c.json({ error: "Sign in required" }, 401);
  }

  c.set("user", session.user);
  c.set("workspace", session.workspace);
  return next();
});

async function requireInvoice(c: { req: { param: (key: string) => string }; get: (key: "workspace") => AuthWorkspace }) {
  return getInvoiceInWorkspace(c.req.param("id"), c.get("workspace").id);
}

function confidenceMap(data: Record<string, { confidence: number }>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value.confidence]),
  );
}

function isPaidStatus(raw: string | null | undefined) {
  if (!raw) return false;
  const normalized = raw.toLowerCase().trim();
  if (/(unpaid|not\s*paid|outstanding|due|overdue|pending|open)/.test(normalized)) {
    return false;
  }
  return /^(paid|settled|received|complete[d]?)$/.test(normalized);
}

app.get("/health", async (c) => {
  try {
    await statement('SELECT i."d1Revision" FROM "Invoice" AS i LIMIT 1').all();
    return c.json({ ok: true, product: "PayChase", database: "ok", backend: "d1" });
  } catch (error) {
    console.error("Health database check failed", error);
    return c.json({ ok: false, product: "PayChase", database: "error" }, 503);
  }
});

app.post(
  "/auth/signup",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      workspaceName: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const result = await signup(c.req.valid("json"));
      setCookie(c, SESSION_COOKIE, result.session.token, cookieOptions());
      return c.json({ user: result.user, workspace: result.workspace });
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json({ error: error.message }, error.status);
      }
      throw error;
    }
  },
);

app.post(
  "/auth/login",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  ),
  async (c) => {
    try {
      const result = await login(c.req.valid("json"));
      setCookie(c, SESSION_COOKIE, result.session.token, cookieOptions());
      return c.json({ user: result.user, workspace: result.workspace });
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json({ error: error.message }, error.status);
      }
      throw error;
    }
  },
);

app.post("/auth/logout", async (c) => {
  await destroySession(getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/auth/me", async (c) => {
  const user = c.get("user");
  const workspace = c.get("workspace");
  if (!user || !workspace) {
    return c.json({ user: null, workspace: null });
  }
  return c.json({ user, workspace });
});

app.patch(
  "/auth/profile",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).optional(),
      workspaceName: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const result = await updateProfile(c.get("user").id, c.req.valid("json"));
    return c.json(result);
  },
);

app.post(
  "/auth/password",
  zValidator(
    "json",
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }),
  ),
  async (c) => {
    try {
      await changePassword(c.get("user").id, c.req.valid("json"));
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json({ error: error.message }, error.status);
      }
      throw error;
    }
  },
);

app.get("/workspace", async (c) => {
  const workspace = await getWorkspaceForUser(c.get("user").id);
  return c.json(workspace);
});

app.get("/dashboard", async (c) => {
  const workspace = c.get("workspace");
  const data = await getDashboardMetrics(workspace.id);
  return c.json(data);
});

app.get("/reports", async (c) => {
  const workspace = c.get("workspace");
  const data = await getReports(workspace.id);
  return c.json(data);
});

app.get("/invoices", async (c) => {
  const workspace = c.get("workspace");
  const status = c.req.query("status");
  const allowedStatuses: InvoiceStatus[] = ["DRAFT", "SENT", "DUE_SOON", "DUE_TODAY", "OVERDUE", "PROMISED", "DISPUTED", "PAID", "WRITTEN_OFF"];
  if (status && !allowedStatuses.includes(status as InvoiceStatus)) throw new DataError("Invalid invoice status");
  const invoices = (await workspaceInvoices(workspace.id)).filter((invoice) => !status || invoice.status === status);
  return c.json(invoices.map(serializeInvoice));
});

app.get("/invoices/:id", async (c) => {
  await requireInvoice(c);
  const invoice = await refreshInvoiceDerivedFields(c.req.param("id"), c.get("workspace").id);
  return c.json({
    ...serializeInvoice(invoice),
    customer: invoice.customer,
    followUps: invoice.followUps,
    promises: invoice.promises.map(serializePromise),
    events: invoice.events,
    extractions: invoice.extractions,
  });
});

app.post("/invoices/upload", async (c) => {
  const workspace = c.get("workspace");
  const body = await c.req.parseBody({ all: true });
  const filesRaw = body.files ?? body.file;
  const files = (Array.isArray(filesRaw) ? filesRaw : [filesRaw]).filter(
    (f): f is File => typeof File !== "undefined" && f instanceof File,
  );

  if (!files.length) {
    return c.json({ error: "No files uploaded" }, 400);
  }

  const extractor = getExtractionProvider();
  const results = [];

  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await storeInvoiceFile({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
    });

    const extraction = await extractor.extractInvoice({
      fileName: file.name,
      mimeType: stored.mimeType,
      base64Data: bytes.toString("base64"),
    });

    const extracted = extraction.data;
    const totalAmount = extracted.totalAmount.value ?? 0;
    const dueDate = extracted.dueDate.value ? new Date(extracted.dueDate.value) : null;
    const issueDate = extracted.issueDate.value
      ? new Date(extracted.issueDate.value)
      : null;

    const customerName = extracted.customerName.value || "Unknown Customer";
    const statusSeed = isPaidStatus(extracted.paymentStatus.value)
      ? ("PAID" as const)
      : ("SENT" as const);

    const statusResult = calculateInvoiceStatus({
      status: statusSeed,
      dueDate,
      amountOutstanding: statusSeed === "PAID" ? 0 : totalAmount,
    });

    const invoice = await createUploadedInvoice({
      workspaceId: workspace.id,
      customer: { name: customerName, email: extracted.customerEmail.value },
      invoice: {
        invoiceNumber: extracted.invoiceNumber.value || `TMP-${Date.now()}`,
        issueDate, dueDate, currency: extracted.currency.value || "USD",
        subtotal: optionalMoney(extracted.subtotal.value), tax: optionalMoney(extracted.tax.value),
        totalAmount: money(totalAmount), amountOutstanding: statusSeed === "PAID" ? 0n : money(totalAmount),
        status: statusResult.status, daysOverdue: statusResult.daysOverdue,
        purchaseOrderRef: extracted.purchaseOrderRef.value, sourceFileUrl: stored.url,
        sourceFileName: stored.fileName, sourceMimeType: stored.mimeType,
        paidAt: statusSeed === "PAID" ? new Date() : null,
      },
      extraction: { extractedData: extracted, confidenceData: confidenceMap(extracted), model: extraction.model },
    });

    const refreshed = await refreshInvoiceDerivedFields(invoice.id, workspace.id);
    results.push({
      ...serializeInvoice(refreshed),
      customer: refreshed.customer,
      extraction: extracted,
      needsReview: Object.values(extracted).some((f) => f.confidence < 0.7),
    });
  }

  const outstanding = amount(results.reduce(
    (sum, inv) => sum + (inv.status === "PAID" ? 0n : money(inv.amountOutstanding)),
    0n,
  ));

  return c.json({
    summary: `${results.length} invoice${results.length === 1 ? "" : "s"} analyzed — $${outstanding.toLocaleString()} outstanding.`,
    invoices: results,
  });
});

const moneySchema = z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+(?:\.\d{1,2})?$/)]).refine((value) => {
  try { money(value); return true; } catch { return false; }
}, "Enter an amount with at most two decimal places.");
const signedMoneySchema = z.union([z.number().finite(), z.string().regex(/^-?\d+(?:\.\d{1,2})?$/)]).refine((value) => {
  try { signedMoney(value); return true; } catch { return false; }
}, "Enter an amount with at most two decimal places.");
const dateSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Enter a valid date.");
const correctSchema = z.object({
  invoiceNumber: z.string().min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional().nullable(),
  issueDate: dateSchema.nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
  currency: z.string().default("USD"),
  subtotal: signedMoneySchema.nullable().optional(),
  tax: signedMoneySchema.nullable().optional(),
  totalAmount: moneySchema,
  amountOutstanding: moneySchema,
  purchaseOrderRef: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

app.patch(
  "/invoices/:id/correct",
  zValidator("json", correctSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    await requireInvoice(c);
    await correctInvoice(id, c.get("workspace").id, body);

    const refreshed = await refreshInvoiceDerivedFields(id, c.get("workspace").id);
    return c.json(serializeInvoice(refreshed));
  },
);

app.post(
  "/invoices/:id/follow-ups/generate",
  zValidator(
    "json",
    z.object({
      tone: z.enum(["friendly", "professional", "firm"]).optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const { tone } = c.req.valid("json");
    await requireInvoice(c);
    const invoice = await invoiceDetails(id, c.get("workspace").id);

    const provider = getFollowUpProvider();
    const generated = await provider.generateReminder({
      customerName:
        invoice.customer?.companyName || invoice.customer?.name || "there",
      invoiceNumber: invoice.invoiceNumber,
      amount: amount(invoice.amountOutstanding),
      currency: invoice.currency,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
      daysOverdue: invoice.daysOverdue,
      status: invoice.status,
      previousReminders: invoice.followUps
        .filter((f) => f.type === "REMINDER")
        .map((f) => ({
          subject: f.subject,
          message: f.message,
          sentAt: f.sentAt?.toISOString() ?? null,
        })),
      customerNotes: invoice.customer?.notes ?? invoice.notes,
      tone,
      missedPromise: invoice.promises.some((p) => p.status === "MISSED"),
    });

    const toneMap: Record<string, FollowUpTone> = {
      friendly: "FRIENDLY",
      professional: "PROFESSIONAL",
      firm: "FIRM",
    };

    const followUp = await createReminder(id, c.get("workspace").id, {
      tone: toneMap[generated.tone], subject: generated.subject, message: generated.message,
      model: generated.model, originalTone: generated.tone,
    });

    return c.json({
      followUp,
      recommendedNextFollowUpDays: generated.recommendedNextFollowUpDays,
      model: generated.model,
    });
  },
);

app.post("/invoices/:id/follow-ups/:followUpId/sent", async (c) => {
  await requireInvoice(c);
  const invoiceId = c.req.param("id");
  const followUpId = c.req.param("followUpId");
  const parsed = z.object({ nextFollowUpDays: z.number().int().min(0).max(365).optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new DataError("Follow-up days must be between 0 and 365.");
  const body = parsed.data;

  const followUp = await markReminderSent(invoiceId, c.get("workspace").id, followUpId, body.nextFollowUpDays ?? 3);

  const refreshed = await refreshInvoiceDerivedFields(invoiceId, c.get("workspace").id);
  return c.json({ followUp, invoice: serializeInvoice(refreshed) });
});

app.post(
  "/invoices/:id/notes",
  zValidator("json", z.object({ note: z.string().min(1) })),
  async (c) => {
    const id = c.req.param("id");
    await requireInvoice(c);
    const { note } = c.req.valid("json");
    const followUp = await addNote(id, c.get("workspace").id, note);
    return c.json(followUp);
  },
);

app.post(
  "/invoices/:id/promise",
  zValidator(
    "json",
    z.object({
      promisedDate: dateSchema,
      promisedAmount: moneySchema.refine((value) => { try { return money(value) > 0n; } catch { return false; } }, "Amount must be positive"),
      notes: z.string().optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    await requireInvoice(c);
    const body = c.req.valid("json");

    const promise = await recordPromise(id, c.get("workspace").id, body);

    const refreshed = await refreshInvoiceDerivedFields(id, c.get("workspace").id);
    return c.json({
      promise: serializePromise(promise),
      invoice: serializeInvoice(refreshed),
    });
  },
);

app.post("/invoices/:id/mark-disputed", async (c) => {
  await requireInvoice(c);
  const id = c.req.param("id");
  await markDisputed(id, c.get("workspace").id);
  const refreshed = await refreshInvoiceDerivedFields(id, c.get("workspace").id);
  return c.json(serializeInvoice(refreshed));
});

app.post("/invoices/:id/mark-paid", async (c) => {
  await requireInvoice(c);
  const id = c.req.param("id");
  await markPaid(id, c.get("workspace").id);
  const refreshed = await refreshInvoiceDerivedFields(id, c.get("workspace").id);

  if (refreshed.customerId) {
    const customerInvoices = await rows<Invoice>("Invoice", 'WHERE "customerId"=? AND "workspaceId"=?',
      [refreshed.customerId, c.get("workspace").id]);
    await batch([update("Customer", { paymentBehavior: inferPaymentBehavior(customerInvoices), updatedAt: new Date() },
      '"id"=? AND "workspaceId"=?', [refreshed.customerId, c.get("workspace").id])]);
  }

  return c.json(serializeInvoice(refreshed));
});

app.get("/customers", async (c) => {
  const workspace = c.get("workspace");
  const baseCustomers = await rows<Customer>("Customer", 'WHERE "workspaceId"=? ORDER BY "name", "id"', [workspace.id]);
  const invoices = await rows<Invoice>("Invoice", 'WHERE "workspaceId"=?', [workspace.id]);
  const customers = baseCustomers.map((customer) => ({ ...customer,
    invoices: invoices.filter((invoice) => invoice.customerId === customer.id) }));

  return c.json(
    customers.map((customer) => {
      const open = customer.invoices.filter(
        (i) => i.status !== "PAID" && i.status !== "WRITTEN_OFF",
      );
      const outstanding = amount(open.reduce((s, i) => s + i.amountOutstanding, 0n));
      const overdue = amount(open.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.amountOutstanding, 0n));
      return {
        id: customer.id,
        name: customer.name,
        companyName: customer.companyName,
        email: customer.email,
        phone: customer.phone,
        notes: customer.notes,
        paymentBehavior: customer.paymentBehavior,
        outstanding,
        overdue,
        invoiceCount: customer.invoices.length,
        invoices: customer.invoices.map(serializeInvoice),
      };
    }),
  );
});

app.get("/customers/:id", async (c) => {
  const customerRow = await one<Customer>("Customer", 'WHERE "id"=? AND "workspaceId"=?',
    [c.req.param("id"), c.get("workspace").id]);
  const customer = customerRow ? { ...customerRow,
    invoices: await rows<Invoice>("Invoice", 'WHERE "customerId"=? AND "workspaceId"=? ORDER BY "dueDate" DESC, "id"',
      [customerRow.id, c.get("workspace").id]) } : null;
  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }
  const open = customer.invoices.filter(
    (i) => i.status !== "PAID" && i.status !== "WRITTEN_OFF",
  );
  return c.json({
    ...customer,
    outstanding: amount(open.reduce((s, i) => s + i.amountOutstanding, 0n)),
    overdue: amount(open.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.amountOutstanding, 0n)),
    invoices: customer.invoices.map(serializeInvoice),
  });
});

app.get("/files/*", async (c) => {
  const relativePath = c.req.path.replace(/^\/api\/files\//, "");
  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    return c.json({ error: "Invalid path" }, 400);
  }
  const owned = await one<Invoice>("Invoice", 'WHERE "workspaceId"=? AND "sourceFileUrl"=?',
    [c.get("workspace").id, `/api/files/${relativePath}`]);
  if (!owned) {
    return c.json({ error: "File not found" }, 404);
  }
  try {
    const { bytes, contentType } = await readStoredFile(relativePath);
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

export type AppType = typeof app;
export { app };
