import type { InvoiceStatus } from "@prisma/client";
import { Badge } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const labels: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  DUE_SOON: "Due soon",
  DUE_TODAY: "Due today",
  OVERDUE: "Overdue",
  PROMISED: "Promised",
  DISPUTED: "Disputed",
  PAID: "Paid",
  WRITTEN_OFF: "Written off",
};

const styles: Record<InvoiceStatus, string> = {
  DRAFT: "bg-stone-100 text-stone-700",
  SENT: "bg-sky-50 text-sky-800",
  DUE_SOON: "bg-amber-50 text-amber-800",
  DUE_TODAY: "bg-orange-50 text-orange-800",
  OVERDUE: "bg-red-50 text-red-800",
  PROMISED: "bg-violet-50 text-violet-800",
  DISPUTED: "bg-stone-800 text-white",
  PAID: "bg-emerald-50 text-emerald-800",
  WRITTEN_OFF: "bg-stone-200 text-stone-600",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge className={cn(styles[status])}>{labels[status]}</Badge>;
}

export function HeatIcon({ heat }: { heat: "hot" | "warm" | "cool" | "cold" }) {
  if (heat === "hot") return <span aria-hidden>🔥</span>;
  if (heat === "warm") return <span aria-hidden>🟡</span>;
  if (heat === "cool") return <span aria-hidden>🟠</span>;
  return <span aria-hidden>⚪</span>;
}
