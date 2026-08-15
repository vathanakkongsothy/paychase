import { PrismaClient, type InvoiceStatus, type PaymentBehavior } from "@prisma/client";
import { addDays, startOfDay } from "../src/lib/utils";
import { hashPassword } from "../src/server/auth/password";
import { calculateInvoiceStatus } from "../src/server/domains/collection/status";
import { calculatePriorityScore } from "../src/server/domains/collection/priority";

const prisma = new PrismaClient();

function daysAgo(n: number) {
  return addDays(startOfDay(new Date()), -n);
}

function daysFromNow(n: number) {
  return addDays(startOfDay(new Date()), n);
}

async function main() {
  await prisma.invoiceEvent.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.paymentPromise.deleteMany();
  await prisma.invoiceExtraction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      email: "demo@paychase.app",
      name: "Alex Rivera",
      passwordHash: await hashPassword("paychase"),
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Rivera Studio",
      ownerId: user.id,
    },
  });

  const customers: Array<{
    name: string;
    companyName: string;
    email: string;
    behavior: PaymentBehavior;
    notes?: string;
  }> = [
    {
      name: "Sokha Meas",
      companyName: "ABC Logistics",
      email: "ap@abclogistics.example",
      behavior: "FREQUENTLY_LATE",
      notes: "Usually pays after second reminder.",
    },
    {
      name: "Dara Chen",
      companyName: "Dara Studio",
      email: "dara@darastudio.example",
      behavior: "SOMETIMES_LATE",
    },
    {
      name: "Vannak Lim",
      companyName: "Mekong Supplies",
      email: "billing@mekongsupplies.example",
      behavior: "USUALLY_ON_TIME",
      notes: "Promised payment soon.",
    },
    {
      name: "Sovan Keo",
      companyName: "Sovan Agency",
      email: "finance@sovanagency.example",
      behavior: "USUALLY_ON_TIME",
    },
    {
      name: "Rithy Phan",
      companyName: "Phnom Creative",
      email: "rithy@phnomcreative.example",
      behavior: "SOMETIMES_LATE",
    },
    {
      name: "Maya Ortiz",
      companyName: "Orbit Software",
      email: "ap@orbitsoftware.example",
      behavior: "UNKNOWN",
    },
  ];

  const createdCustomers = [];
  for (const c of customers) {
    createdCustomers.push(
      await prisma.customer.create({
        data: {
          workspaceId: workspace.id,
          name: c.name,
          companyName: c.companyName,
          email: c.email,
          paymentBehavior: c.behavior,
          notes: c.notes,
        },
      }),
    );
  }

  const [abc, dara, mekong, sovan, phnom, orbit] = createdCustomers;

  type SeedInvoice = {
    customerId: string;
    invoiceNumber: string;
    issueDaysAgo: number;
    dueDaysAgo: number;
    total: number;
    outstanding: number;
    statusHint?: InvoiceStatus;
    lastFollowUpDaysAgo?: number | null;
    nextFollowUpInDays?: number | null;
    paidDaysAgo?: number | null;
    notes?: string;
  };

  const seedInvoices: SeedInvoice[] = [
    {
      customerId: abc.id,
      invoiceNumber: "104",
      issueDaysAgo: 35,
      dueDaysAgo: 21,
      total: 1200,
      outstanding: 1200,
      lastFollowUpDaysAgo: 6,
    },
    {
      customerId: abc.id,
      invoiceNumber: "108",
      issueDaysAgo: 22,
      dueDaysAgo: 8,
      total: 1500,
      outstanding: 1500,
      lastFollowUpDaysAgo: null,
    },
    {
      customerId: dara.id,
      invoiceNumber: "211",
      issueDaysAgo: 26,
      dueDaysAgo: 12,
      total: 850,
      outstanding: 850,
      lastFollowUpDaysAgo: null,
    },
    {
      customerId: mekong.id,
      invoiceNumber: "330",
      issueDaysAgo: 28,
      dueDaysAgo: 10,
      total: 2400,
      outstanding: 2400,
      statusHint: "PROMISED",
      lastFollowUpDaysAgo: 2,
      nextFollowUpInDays: 1,
    },
    {
      customerId: sovan.id,
      invoiceNumber: "415",
      issueDaysAgo: 10,
      dueDaysAgo: -3,
      total: 600,
      outstanding: 600,
    },
    {
      customerId: phnom.id,
      invoiceNumber: "502",
      issueDaysAgo: 45,
      dueDaysAgo: 31,
      total: 980,
      outstanding: 980,
      lastFollowUpDaysAgo: 15,
    },
    {
      customerId: orbit.id,
      invoiceNumber: "618",
      issueDaysAgo: 18,
      dueDaysAgo: 0,
      total: 1450,
      outstanding: 1450,
    },
    {
      customerId: orbit.id,
      invoiceNumber: "601",
      issueDaysAgo: 60,
      dueDaysAgo: 40,
      total: 2200,
      outstanding: 0,
      statusHint: "PAID",
      paidDaysAgo: 5,
    },
    {
      customerId: sovan.id,
      invoiceNumber: "401",
      issueDaysAgo: 50,
      dueDaysAgo: 35,
      total: 1200,
      outstanding: 0,
      statusHint: "PAID",
      paidDaysAgo: 12,
    },
    {
      customerId: phnom.id,
      invoiceNumber: "490",
      issueDaysAgo: 40,
      dueDaysAgo: 20,
      total: 700,
      outstanding: 700,
      statusHint: "DISPUTED",
      notes: "Customer disputes line item on design revisions.",
    },
  ];

  for (const seed of seedInvoices) {
    const dueDate = daysAgo(seed.dueDaysAgo);
    const issueDate = daysAgo(seed.issueDaysAgo);
    const statusResult = calculateInvoiceStatus({
      status: seed.statusHint ?? "SENT",
      dueDate,
      amountOutstanding: seed.outstanding,
      activePromise:
        seed.statusHint === "PROMISED"
          ? { promisedDate: daysFromNow(1), status: "ACTIVE" }
          : null,
    });

    const hasFollowUp = seed.lastFollowUpDaysAgo != null;
    const lastFollowUpAt =
      seed.lastFollowUpDaysAgo != null ? daysAgo(seed.lastFollowUpDaysAgo) : null;

    const priority = calculatePriorityScore({
      amountOutstanding: seed.outstanding,
      daysOverdue: statusResult.daysOverdue,
      status: statusResult.status,
      lastFollowUpAt,
      hasFollowUp,
      missedPromise: false,
      activePromise:
        seed.statusHint === "PROMISED"
          ? { promisedDate: daysFromNow(1), status: "ACTIVE" }
          : null,
      customerBehavior:
        createdCustomers.find((c) => c.id === seed.customerId)?.paymentBehavior,
    });

    const invoice = await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        customerId: seed.customerId,
        invoiceNumber: seed.invoiceNumber,
        issueDate,
        dueDate,
        currency: "USD",
        subtotal: seed.total / 1.1,
        tax: seed.total - seed.total / 1.1,
        totalAmount: seed.total,
        amountOutstanding: seed.outstanding,
        status: statusResult.status,
        daysOverdue: statusResult.daysOverdue,
        priorityScore: priority.score,
        lastFollowUpAt,
        nextFollowUpAt:
          seed.nextFollowUpInDays != null
            ? daysFromNow(seed.nextFollowUpInDays)
            : null,
        paidAt: seed.paidDaysAgo != null ? daysAgo(seed.paidDaysAgo) : null,
        notes: seed.notes,
        events: {
          create: [
            { type: "INVOICE_UPLOADED", metadata: { source: "seed" } },
            { type: "INVOICE_SAVED", metadata: { source: "seed" } },
          ],
        },
      },
    });

    if (hasFollowUp) {
      await prisma.followUp.create({
        data: {
          invoiceId: invoice.id,
          type: "REMINDER",
          tone: "PROFESSIONAL",
          subject: `Payment reminder for Invoice #${seed.invoiceNumber}`,
          message: `Following up on Invoice #${seed.invoiceNumber}.`,
          status: "SENT",
          sentAt: lastFollowUpAt!,
        },
      });
      await prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          type: "REMINDER_SENT",
          metadata: {},
          createdAt: lastFollowUpAt!,
        },
      });
    }

    if (seed.statusHint === "PROMISED") {
      await prisma.paymentPromise.create({
        data: {
          invoiceId: invoice.id,
          promisedDate: daysFromNow(1),
          promisedAmount: seed.outstanding,
          status: "ACTIVE",
          notes: "Customer confirmed via email.",
        },
      });
      await prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          type: "PROMISE_RECORDED",
          metadata: { promisedDate: daysFromNow(1).toISOString() },
        },
      });
    }

    if (seed.statusHint === "DISPUTED") {
      await prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          type: "MARKED_DISPUTED",
          metadata: {},
        },
      });
    }

    if (seed.statusHint === "PAID") {
      await prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          type: "MARKED_PAID",
          metadata: {},
          createdAt: daysAgo(seed.paidDaysAgo ?? 0),
        },
      });
    }
  }

  const open = await prisma.invoice.aggregate({
    where: {
      workspaceId: workspace.id,
      status: { notIn: ["PAID", "WRITTEN_OFF"] },
    },
    _sum: { amountOutstanding: true },
  });

  console.log("Seeded PayChase demo workspace:", workspace.name);
  console.log("Sign in: demo@paychase.app / paychase");
  console.log(
    "Outstanding:",
    Number(open._sum.amountOutstanding ?? 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
