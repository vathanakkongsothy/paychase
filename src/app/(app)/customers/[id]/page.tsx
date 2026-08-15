"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

type CustomerDetail = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  notes: string | null;
  paymentBehavior: string;
  outstanding: number;
  overdue: number;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amountOutstanding: number;
    totalAmount: number;
    daysOverdue: number;
    status: string;
    dueDate: string | null;
  }>;
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["customer", params.id],
    queryFn: () => apiGet<CustomerDetail>(`/api/customers/${params.id}`),
  });

  if (isLoading || !data) {
    return <p className="text-stone-500">Loading customer…</p>;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="page-title">{data.companyName || data.name}</h1>
        <p className="mt-2 break-words text-sm text-stone-600 sm:text-base">
          {data.email || "No email on file"}
          {data.notes ? ` · ${data.notes}` : ""}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-xs text-stone-500 sm:text-sm">Outstanding</div>
            <div className="money text-2xl font-semibold sm:text-3xl">
              {formatMoney(data.outstanding)}
            </div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-xs text-stone-500 sm:text-sm">Overdue</div>
            <div className="money text-2xl font-semibold text-red-700 sm:text-3xl">
              {formatMoney(data.overdue)}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2.5 md:hidden">
        {data.invoices.map((invoice) => (
          <Link
            key={invoice.id}
            href={`/invoices/${invoice.id}`}
            className="block rounded-xl border border-stone-200 bg-white p-3.5 active:bg-stone-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">#{invoice.invoiceNumber}</p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {invoice.dueDate
                    ? new Date(invoice.dueDate).toLocaleDateString()
                    : "No due date"}
                  {invoice.daysOverdue > 0 ? ` · ${invoice.daysOverdue}d late` : ""}
                </p>
              </div>
              <p className="money font-semibold">
                {formatMoney(invoice.amountOutstanding || invoice.totalAmount)}
              </p>
            </div>
            <div className="mt-2">
              <StatusBadge status={invoice.status as never} />
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-stone-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-500">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                    #{invoice.invoiceNumber}
                  </Link>
                </td>
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
                  {formatMoney(invoice.amountOutstanding || invoice.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
