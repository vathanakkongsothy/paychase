"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { HeatIcon, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardResponse = {
  metrics: {
    outstanding: number;
    overdue: number;
    dueThisWeek: number;
    recoveredThisMonth: number;
    invoiceCount: number;
  };
  chaseList: Array<{
    id: string;
    invoiceNumber: string;
    amountOutstanding: number;
    currency: string;
    daysOverdue: number;
    status: string;
    customerName: string;
    lastFollowUpAt: string | null;
    heat: "hot" | "warm" | "cool" | "cold";
    missedPromise: boolean;
    activePromise: { promisedDate: string } | null;
  }>;
  disputed: Array<{
    id: string;
    invoiceNumber: string;
    amountOutstanding: number;
    customerName: string;
  }>;
};

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="p-3 sm:p-5">
        <p className="text-xs text-stone-500 sm:text-sm">{label}</p>
        <CardTitle className={`money text-xl sm:text-3xl ${accent ?? "text-stone-900"}`}>
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardResponse>("/api/dashboard"),
  });

  if (isLoading) {
    return <p className="text-stone-500">Loading where your money is…</p>;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
        <h1 className="page-title">Could not load dashboard</h1>
        <p className="mt-2 text-stone-600">
          Check that Postgres is running. For the seeded demo workspace:{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-sm">
            pnpm db:setup
          </code>
        </p>
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link href="/invoices/upload">Upload Invoices</Link>
        </Button>
      </div>
    );
  }

  const { metrics, chaseList, disputed } = data;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-800 sm:text-sm">
          Where is my money?
        </p>
        <h1 className="page-title mt-1 text-stone-900">Dashboard</h1>
        <p className="mt-2 text-sm text-stone-600 sm:text-base">
          {metrics.invoiceCount} invoices analyzed —{" "}
          <span className="font-semibold text-stone-900">
            {formatMoney(metrics.outstanding)} outstanding
          </span>
          .
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <Metric label="Outstanding" value={formatMoney(metrics.outstanding)} />
        <Metric
          label="Overdue"
          value={formatMoney(metrics.overdue)}
          accent="text-red-700"
        />
        <Metric label="Due this week" value={formatMoney(metrics.dueThisWeek)} />
        <Metric
          label="Recovered"
          value={formatMoney(metrics.recoveredThisMonth)}
          accent="text-emerald-700"
        />
      </div>

      <section className="space-y-3 sm:space-y-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl">
            Today&apos;s Chase List
          </h2>
          <p className="text-sm text-stone-500">
            Prioritized by amount, overdue age, and follow-up gaps.
          </p>
        </div>
        <div className="space-y-2.5 sm:space-y-3">
          {chaseList.map((item) => (
            <Link
              key={item.id}
              href={`/invoices/${item.id}`}
              className="block rounded-xl border border-stone-200 bg-white p-3.5 transition active:bg-stone-50 sm:p-4 hover:border-teal-700/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-base font-semibold text-stone-900 sm:text-lg">
                    <HeatIcon heat={item.heat} />
                    <span className="truncate">{item.customerName}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-stone-500">
                    <span>#{item.invoiceNumber}</span>
                    <StatusBadge status={item.status as never} />
                  </div>
                  {item.missedPromise ? (
                    <p className="mt-1 text-sm font-medium text-red-700">
                      Payment promise missed
                    </p>
                  ) : item.activePromise ? (
                    <p className="mt-1 text-sm text-violet-700">
                      Promised{" "}
                      {new Date(item.activePromise.promisedDate).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className="money text-xl font-semibold text-stone-900 sm:text-2xl">
                    {formatMoney(item.amountOutstanding, item.currency)}
                  </div>
                  <div className="text-xs text-stone-500 sm:text-sm">
                    {item.daysOverdue > 0
                      ? `${item.daysOverdue}d overdue`
                      : item.status === "DUE_TODAY"
                        ? "Due today"
                        : item.status === "DUE_SOON"
                          ? "Due soon"
                          : "Open"}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-stone-400 sm:text-sm">
                {item.lastFollowUpAt
                  ? `Last contacted ${Math.max(
                      0,
                      Math.floor(
                        (Date.now() - new Date(item.lastFollowUpAt).getTime()) /
                          86400000,
                      ),
                    )} days ago`
                  : "No reminder sent"}
              </p>
            </Link>
          ))}
          {!chaseList.length ? (
            <Card>
              <CardContent className="py-10 text-center text-stone-500">
                No invoices to chase. Upload invoices to find overdue money.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      {disputed.length ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg sm:text-xl">
            Disputed queue
          </h2>
          {disputed.map((item) => (
            <Link
              key={item.id}
              href={`/invoices/${item.id}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-stone-300 bg-stone-900 px-4 py-3 text-white"
            >
              <span className="min-w-0 truncate">
                {item.customerName} · #{item.invoiceNumber}
              </span>
              <span className="money shrink-0">{formatMoney(item.amountOutstanding)}</span>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
