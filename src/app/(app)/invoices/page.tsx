"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

type Invoice = {
  id: string;
  invoiceNumber: string;
  amountOutstanding: number;
  totalAmount: number;
  currency: string;
  daysOverdue: number;
  status: string;
  dueDate: string | null;
  customer?: { name: string; companyName: string | null } | null;
};

export default function InvoicesPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiGet<Invoice[]>("/api/invoices"),
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="page-title">Invoices</h1>
        <p className="mt-2 text-sm text-stone-600 sm:text-base">
          Every open balance, ordered by collection priority.
        </p>
      </div>

      {isLoading ? <p className="text-stone-500">Loading invoices…</p> : null}

      <div className="space-y-2.5 md:hidden">
        {data.map((invoice) => (
          <Link
            key={invoice.id}
            href={`/invoices/${invoice.id}`}
            className="block rounded-xl border border-stone-200 bg-white p-3.5 active:bg-stone-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-stone-900">
                  {invoice.customer?.companyName || invoice.customer?.name || "Unknown"}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">
                  #{invoice.invoiceNumber}
                  {invoice.dueDate
                    ? ` · ${new Date(invoice.dueDate).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <p className="money shrink-0 text-lg font-semibold">
                {formatMoney(invoice.amountOutstanding, invoice.currency)}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <StatusBadge status={invoice.status as never} />
              {invoice.daysOverdue > 0 ? (
                <span className="text-sm text-red-700">{invoice.daysOverdue}d late</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-stone-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.map((invoice) => (
              <tr key={invoice.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                    {invoice.customer?.companyName || invoice.customer?.name || "Unknown"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-stone-600">#{invoice.invoiceNumber}</td>
                <td className="px-4 py-3 text-stone-600">
                  {invoice.dueDate
                    ? new Date(invoice.dueDate).toLocaleDateString()
                    : "—"}
                  {invoice.daysOverdue > 0 ? (
                    <span className="ml-2 text-red-700">{invoice.daysOverdue}d late</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={invoice.status as never} />
                </td>
                <td className="money px-4 py-3 text-right font-semibold">
                  {formatMoney(invoice.amountOutstanding, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!data.length && !isLoading ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          No invoices yet.{" "}
          <Link href="/invoices/upload" className="text-teal-800 underline">
            Upload invoices
          </Link>{" "}
          to find who still owes you money.
        </div>
      ) : null}
    </div>
  );
}
