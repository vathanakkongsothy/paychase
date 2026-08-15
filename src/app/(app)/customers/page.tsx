"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/input";

type Customer = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  paymentBehavior: string;
  outstanding: number;
  overdue: number;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amountOutstanding: number;
    daysOverdue: number;
    status: string;
    dueDate: string | null;
  }>;
};

const behaviorLabel: Record<string, string> = {
  USUALLY_ON_TIME: "Usually on time",
  SOMETIMES_LATE: "Sometimes late",
  FREQUENTLY_LATE: "Frequently late",
  UNKNOWN: "Unknown",
};

export default function CustomersPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiGet<Customer[]>("/api/customers"),
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="page-title">Customers</h1>
        <p className="mt-2 text-sm text-stone-600 sm:text-base">
          Aggregate outstanding balances by who owes you.
        </p>
      </div>

      {isLoading ? <p className="text-stone-500">Loading customers…</p> : null}

      <div className="space-y-3 sm:space-y-4">
        {data.map((customer) => (
          <div
            key={customer.id}
            className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/customers/${customer.id}`}
                  className="block truncate text-lg font-semibold hover:underline sm:text-xl"
                >
                  {customer.companyName || customer.name}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                  {customer.email ? (
                    <span className="truncate">{customer.email}</span>
                  ) : null}
                  <Badge className="bg-stone-100 text-stone-700">
                    {behaviorLabel[customer.paymentBehavior] || "Unknown"}
                  </Badge>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs text-stone-500 sm:text-sm">Outstanding</div>
                <div className="money text-xl font-semibold sm:text-2xl">
                  {formatMoney(customer.outstanding)}
                </div>
                <div className="text-xs text-red-700 sm:text-sm">
                  Overdue {formatMoney(customer.overdue)}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2 sm:mt-4">
              {customer.invoices
                .filter((i) => i.status !== "PAID" && i.status !== "WRITTEN_OFF")
                .map((invoice) => (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    className="flex min-h-12 items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2.5 text-sm active:bg-stone-100"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">#{invoice.invoiceNumber}</span>
                      <span className="text-stone-500">
                        {" "}
                        · {formatMoney(invoice.amountOutstanding)}
                      </span>
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {invoice.daysOverdue > 0
                          ? `${invoice.daysOverdue} days late`
                          : invoice.dueDate
                            ? `due ${new Date(invoice.dueDate).toLocaleDateString()}`
                            : ""}
                      </span>
                    </span>
                    <StatusBadge status={invoice.status as never} />
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
