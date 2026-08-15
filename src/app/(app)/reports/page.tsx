"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Reports = {
  outstanding: number;
  overdue: number;
  collected: number;
  recoveredThisMonth: number;
  averageDaysOverdue: number;
  aging: Record<string, number>;
};

export default function ReportsPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reports"],
    queryFn: () => apiGet<Reports>("/api/reports"),
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="mt-2 text-sm text-stone-500">Loading recovery totals…</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/80" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="page-title">Reports unavailable</h1>
        <p className="mt-2 text-sm text-stone-600">
          {error instanceof Error
            ? error.message
            : "The reports API failed. Restart the Next.js server after switching to Postgres."}
        </p>
        <Button className="mt-4" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const agingEntries = [
    ["1–7 days", data.aging["1-7"]],
    ["8–14 days", data.aging["8-14"]],
    ["15–30 days", data.aging["15-30"]],
    ["31–60 days", data.aging["31-60"]],
    ["60+ days", data.aging["60+"]],
  ] as const;

  const maxAging = Math.max(...agingEntries.map(([, v]) => v), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="mt-2 text-sm text-stone-600 sm:text-base">
          Simple recovery analytics — not full accounting reports.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
        {[
          ["Outstanding", data.outstanding],
          ["Overdue", data.overdue],
          ["Collected", data.collected],
          ["Recovery this month", data.recoveredThisMonth],
          ["Average days overdue", data.averageDaysOverdue],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardHeader>
              <p className="text-sm text-stone-500">{label}</p>
              <CardTitle className="money text-xl sm:text-3xl">
                {label === "Average days overdue"
                  ? `${value}`
                  : formatMoney(value as number)}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aging buckets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {agingEntries.map(([label, value]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{label}</span>
                <span className="money font-medium">{formatMoney(value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-red-600/80"
                  style={{ width: `${(value / maxAging) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
