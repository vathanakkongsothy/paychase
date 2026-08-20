import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, runWithPrisma } from "@/server/db/prisma";
import {
  getInvoiceInWorkspace,
  getWorkspaceForUser,
  inferPaymentBehavior,
  refreshInvoiceDerivedFields,
  serializeInvoice,
  serializePromise,
} from "@/server/domains/invoice/service";
import { getDashboardMetrics, getReports } from "@/server/domains/analytics/service";
import { getExtractionProvider, getFollowUpProvider } from "@/server/ai/providers";
import { storeInvoiceFile, readStoredFile } from "@/server/storage";
import { calculateInvoiceStatus } from "@/server/domains/collection/status";
import { addDays, toNumber } from "@/lib/utils";
import type { FollowUpTone } from "@prisma/client";
import {
  AuthError,
  changePassword,
  login,
  signup,
  updateProfile,
} from "@/server/auth/service";
import {
  SESSION_COOKIE,
  cookieOptions,
  destroySession,
  getSessionUser,
} from "@/server/auth/session";

type AuthUser = { id: string; email: string; name: string };
type AuthWorkspace = { id: string; name: string; ownerId: string };

const app = new Hono<{
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
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientRustPanicError ||
    err instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return c.json(
      { error: "Could not reach the database. Try again shortly." },
      503,
    );
  }
  return c.json({ error: "Something went wrong" }, 500);
});

app.use("*", (_c, next) => runWithPrisma(() => next()));

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
    await prisma.$queryRawUnsafe("SELECT 1");
    return c.json({ ok: true, product: "PayChase", database: "ok" });
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
  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId: workspace.id,
      ...(status ? { status: status as never } : {}),
    },
    include: { customer: true },
    orderBy: [{ priorityScore: "desc" }, { dueDate: "asc" }],
  });
  return c.json(invoices.map(serializeInvoice));
});

app.get("/invoices/:id", async (c) => {
  await requireInvoice(c);
  const invoice = await refreshInvoiceDerivedFields(c.req.param("id"));
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
    let customer = await prisma.customer.findFirst({
      where: {
        workspaceId: workspace.id,
        OR: [{ name: customerName }, { companyName: customerName }],
      },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          workspaceId: workspace.id,
          name: customerName,
          companyName: customerName,
          email: extracted.customerEmail.value,
        },
      });
    }

    const statusSeed = isPaidStatus(extracted.paymentStatus.value)
      ? ("PAID" as const)
      : ("SENT" as const);

    const statusResult = calculateInvoiceStatus({
      status: statusSeed,
      dueDate,
      amountOutstanding: statusSeed === "PAID" ? 0 : totalAmount,
    });

    const invoice = await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        customerId: customer.id,
        invoiceNumber: extracted.invoiceNumber.value || `TMP-${Date.now()}`,
        issueDate,
        dueDate,
        currency: extracted.currency.value || "USD",
        subtotal: extracted.subtotal.value,
        tax: extracted.tax.value,
        totalAmount,
        amountOutstanding: statusSeed === "PAID" ? 0 : totalAmount,
        status: statusResult.status,
        daysOverdue: statusResult.daysOverdue,
        purchaseOrderRef: extracted.purchaseOrderRef.value,
        sourceFileUrl: stored.url,
        sourceFileName: stored.fileName,
        sourceMimeType: stored.mimeType,
        paidAt: statusSeed === "PAID" ? new Date() : null,
        events: {
          create: [
            { type: "INVOICE_UPLOADED", metadata: { fileName: file.name } },
            {
              type: "INVOICE_EXTRACTED",
              metadata: { model: extraction.model },
            },
          ],
        },
        extractions: {
          create: {
            extractedData: extracted,
            confidenceData: confidenceMap(extracted),
            model: extraction.model,
          },
        },
      },
      include: { customer: true, extractions: true },
    });

    const refreshed = await refreshInvoiceDerivedFields(invoice.id);
    results.push({
      ...serializeInvoice(refreshed),
      customer: refreshed.customer,
      extraction: extracted,
      needsReview: Object.values(extracted).some((f) => f.confidence < 0.7),
    });
  }

  const outstanding = results.reduce(
    (sum, inv) => sum + (inv.status === "PAID" ? 0 : inv.amountOutstanding),
    0,
  );

  return c.json({
    summary: `${results.length} invoice${results.length === 1 ? "" : "s"} analyzed — $${outstanding.toLocaleString()} outstanding.`,
    invoices: results,
  });
});

const correctSchema = z.object({
  invoiceNumber: z.string().min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional().nullable(),
  issueDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  currency: z.string().default("USD"),
  subtotal: z.number().nullable().optional(),
  tax: z.number().nullable().optional(),
  totalAmount: z.number().nonnegative(),
  amountOutstanding: z.number().nonnegative(),
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
    const existing = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { customer: true },
    });

    if (existing.customerId) {
      await prisma.customer.update({
        where: { id: existing.customerId },
        data: {
          name: body.customerName,
          companyName: body.customerName,
          email: body.customerEmail ?? undefined,
        },
      });
    }

    await prisma.invoice.update({
      where: { id },
      data: {
        invoiceNumber: body.invoiceNumber,
        issueDate: body.issueDate ? new Date(body.issueDate) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        currency: body.currency,
        subtotal: body.subtotal,
        tax: body.tax,
        totalAmount: body.totalAmount,
        amountOutstanding: body.amountOutstanding,
        purchaseOrderRef: body.purchaseOrderRef,
        notes: body.notes,
        events: {
          create: { type: "INVOICE_CORRECTED", metadata: { fields: Object.keys(body) } },
        },
      },
    });

    const refreshed = await refreshInvoiceDerivedFields(id);
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
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: {
        customer: true,
        followUps: { orderBy: { createdAt: "desc" } },
        promises: true,
      },
    });

    const provider = getFollowUpProvider();
    const generated = await provider.generateReminder({
      customerName:
        invoice.customer?.companyName || invoice.customer?.name || "there",
      invoiceNumber: invoice.invoiceNumber,
      amount: toNumber(invoice.amountOutstanding),
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

    const followUp = await prisma.followUp.create({
      data: {
        invoiceId: id,
        type: "REMINDER",
        tone: toneMap[generated.tone],
        subject: generated.subject,
        message: generated.message,
        status: "DRAFT",
      },
    });

    await prisma.invoiceEvent.create({
      data: {
        invoiceId: id,
        type: "REMINDER_GENERATED",
        metadata: {
          followUpId: followUp.id,
          tone: generated.tone,
          model: generated.model,
        },
      },
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
  const body = await c.req
    .json()
    .catch(() => ({ nextFollowUpDays: 3 })) as { nextFollowUpDays?: number };

  const followUp = await prisma.followUp.update({
    where: { id: followUpId },
    data: { status: "SENT", sentAt: new Date() },
  });

  const nextFollowUpAt = addDays(new Date(), body.nextFollowUpDays ?? 3);

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      lastFollowUpAt: new Date(),
      nextFollowUpAt,
      events: {
        create: [
          {
            type: "REMINDER_SENT",
            metadata: { followUpId },
          },
          {
            type: "FOLLOW_UP_SCHEDULED",
            metadata: { nextFollowUpAt: nextFollowUpAt.toISOString() },
          },
        ],
      },
    },
  });

  const refreshed = await refreshInvoiceDerivedFields(invoiceId);
  return c.json({ followUp, invoice: serializeInvoice(refreshed) });
});

app.post(
  "/invoices/:id/notes",
  zValidator("json", z.object({ note: z.string().min(1) })),
  async (c) => {
    const id = c.req.param("id");
    await requireInvoice(c);
    const { note } = c.req.valid("json");
    const followUp = await prisma.followUp.create({
      data: {
        invoiceId: id,
        type: "NOTE",
        message: note,
        status: "SENT",
        sentAt: new Date(),
      },
    });
    await prisma.invoice.update({
      where: { id },
      data: {
        notes: note,
        events: { create: { type: "NOTE_ADDED", metadata: { note } } },
      },
    });
    return c.json(followUp);
  },
);

app.post(
  "/invoices/:id/promise",
  zValidator(
    "json",
    z.object({
      promisedDate: z.string(),
      promisedAmount: z.number().positive(),
      notes: z.string().optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    await requireInvoice(c);
    const body = c.req.valid("json");

    await prisma.paymentPromise.updateMany({
      where: { invoiceId: id, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });

    const promise = await prisma.paymentPromise.create({
      data: {
        invoiceId: id,
        promisedDate: new Date(body.promisedDate),
        promisedAmount: body.promisedAmount,
        notes: body.notes,
        status: "ACTIVE",
      },
    });

    await prisma.invoice.update({
      where: { id },
      data: {
        status: "PROMISED",
        events: {
          create: {
            type: "PROMISE_RECORDED",
            metadata: {
              promisedDate: body.promisedDate,
              promisedAmount: body.promisedAmount,
            },
          },
        },
      },
    });

    const refreshed = await refreshInvoiceDerivedFields(id);
    return c.json({
      promise: serializePromise(promise),
      invoice: serializeInvoice(refreshed),
    });
  },
);

app.post("/invoices/:id/mark-disputed", async (c) => {
  await requireInvoice(c);
  const id = c.req.param("id");
  await prisma.invoice.update({
    where: { id },
    data: {
      status: "DISPUTED",
      events: { create: { type: "MARKED_DISPUTED" } },
    },
  });
  const refreshed = await refreshInvoiceDerivedFields(id);
  return c.json(serializeInvoice(refreshed));
});

app.post("/invoices/:id/mark-paid", async (c) => {
  await requireInvoice(c);
  const id = c.req.param("id");
  await prisma.invoice.update({
    where: { id },
    data: {
      status: "PAID",
      amountOutstanding: 0,
      paidAt: new Date(),
      daysOverdue: 0,
      events: { create: { type: "MARKED_PAID" } },
    },
  });
  await prisma.paymentPromise.updateMany({
    where: { invoiceId: id, status: "ACTIVE" },
    data: { status: "KEPT" },
  });
  const refreshed = await refreshInvoiceDerivedFields(id);

  if (refreshed.customerId) {
    const customerInvoices = await prisma.invoice.findMany({
      where: { customerId: refreshed.customerId },
    });
    await prisma.customer.update({
      where: { id: refreshed.customerId },
      data: { paymentBehavior: inferPaymentBehavior(customerInvoices) },
    });
  }

  return c.json(serializeInvoice(refreshed));
});

app.get("/customers", async (c) => {
  const workspace = c.get("workspace");
  const customers = await prisma.customer.findMany({
    where: { workspaceId: workspace.id },
    include: { invoices: true },
    orderBy: { name: "asc" },
  });

  return c.json(
    customers.map((customer) => {
      const open = customer.invoices.filter(
        (i) => i.status !== "PAID" && i.status !== "WRITTEN_OFF",
      );
      const outstanding = open.reduce((s, i) => s + toNumber(i.amountOutstanding), 0);
      const overdue = open
        .filter((i) => i.daysOverdue > 0)
        .reduce((s, i) => s + toNumber(i.amountOutstanding), 0);
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
  const customer = await prisma.customer.findFirst({
    where: { id: c.req.param("id"), workspaceId: c.get("workspace").id },
    include: { invoices: { orderBy: { dueDate: "desc" } } },
  });
  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }
  const open = customer.invoices.filter(
    (i) => i.status !== "PAID" && i.status !== "WRITTEN_OFF",
  );
  return c.json({
    ...customer,
    outstanding: open.reduce((s, i) => s + toNumber(i.amountOutstanding), 0),
    overdue: open
      .filter((i) => i.daysOverdue > 0)
      .reduce((s, i) => s + toNumber(i.amountOutstanding), 0),
    invoices: customer.invoices.map(serializeInvoice),
  });
});

app.get("/files/*", async (c) => {
  const relativePath = c.req.path.replace(/^\/api\/files\//, "");
  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    return c.json({ error: "Invalid path" }, 400);
  }
  const owned = await prisma.invoice.findFirst({
    where: {
      workspaceId: c.get("workspace").id,
      sourceFileUrl: `/api/files/${relativePath}`,
    },
    select: { id: true },
  });
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
