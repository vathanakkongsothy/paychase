"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/api";
import { formatMoney, formatMoneyPrecise } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  amountOutstanding: number;
  totalAmount: number;
  currency: string;
  daysOverdue: number;
  status: string;
  dueDate: string | null;
  issueDate: string | null;
  notes: string | null;
  sourceFileUrl: string | null;
  sourceMimeType: string | null;
  nextFollowUpAt: string | null;
  customer: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    notes: string | null;
  } | null;
  followUps: Array<{
    id: string;
    type: string;
    tone: string | null;
    subject: string | null;
    message: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
  }>;
  promises: Array<{
    id: string;
    promisedDate: string;
    promisedAmount: number;
    status: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    metadata: unknown;
    createdAt: string;
  }>;
};

const eventLabels: Record<string, string> = {
  INVOICE_UPLOADED: "Invoice uploaded",
  INVOICE_EXTRACTED: "Invoice extracted",
  INVOICE_CORRECTED: "Invoice corrected",
  INVOICE_SAVED: "Invoice saved",
  REMINDER_GENERATED: "Reminder generated",
  REMINDER_SENT: "Reminder marked sent",
  NOTE_ADDED: "Follow-up note",
  PROMISE_RECORDED: "Customer promised payment",
  PROMISE_MISSED: "Payment promise missed",
  FOLLOW_UP_SCHEDULED: "Next follow-up scheduled",
  MARKED_DISPUTED: "Marked disputed",
  MARKED_PAID: "Payment received",
  MARKED_WRITTEN_OFF: "Invoice closed",
  STATUS_CHANGED: "Status changed",
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const [tone, setTone] = useState<"friendly" | "professional" | "firm">("professional");
  const [note, setNote] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [edit, setEdit] = useState<{
    invoiceNumber: string;
    customerName: string;
    customerEmail: string;
    dueDate: string;
    totalAmount: string;
    amountOutstanding: string;
  } | null>(null);
  const [draft, setDraft] = useState<{
    followUpId: string;
    subject: string;
    message: string;
    recommendedNextFollowUpDays: number;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => apiGet<InvoiceDetail>(`/api/invoices/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["invoice", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
  };

  const generate = useMutation({
    mutationFn: () =>
      apiSend<{
        followUp: { id: string; subject: string; message: string };
        recommendedNextFollowUpDays: number;
      }>(`/api/invoices/${id}/follow-ups/generate`, {
        method: "POST",
        body: JSON.stringify({ tone }),
      }),
    onSuccess: (res) => {
      setDraft({
        followUpId: res.followUp.id,
        subject: res.followUp.subject ?? "",
        message: res.followUp.message,
        recommendedNextFollowUpDays: res.recommendedNextFollowUpDays,
      });
      toast.success("Follow-up generated");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markSent = useMutation({
    mutationFn: () =>
      apiSend(`/api/invoices/${id}/follow-ups/${draft!.followUpId}/sent`, {
        method: "POST",
        body: JSON.stringify({
          nextFollowUpDays: draft!.recommendedNextFollowUpDays,
        }),
      }),
    onSuccess: () => {
      toast.success("Reminder marked as sent");
      setDraft(null);
      invalidate();
    },
  });

  const addNote = useMutation({
    mutationFn: () =>
      apiSend(`/api/invoices/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      setNote("");
      toast.success("Note added");
      invalidate();
    },
  });

  const recordPromise = useMutation({
    mutationFn: () =>
      apiSend(`/api/invoices/${id}/promise`, {
        method: "POST",
        body: JSON.stringify({
          promisedDate: promiseDate,
          promisedAmount: Number(promiseAmount),
        }),
      }),
    onSuccess: () => {
      toast.success("Promise recorded");
      setPromiseDate("");
      setPromiseAmount("");
      invalidate();
    },
  });

  const markPaid = useMutation({
    mutationFn: () => apiSend(`/api/invoices/${id}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Invoice marked paid");
      invalidate();
    },
  });

  const markDisputed = useMutation({
    mutationFn: () =>
      apiSend(`/api/invoices/${id}/mark-disputed`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Invoice marked disputed");
      invalidate();
    },
  });

  const correct = useMutation({
    mutationFn: () =>
      apiSend(`/api/invoices/${id}/correct`, {
        method: "PATCH",
        body: JSON.stringify({
          invoiceNumber: edit!.invoiceNumber,
          customerName: edit!.customerName,
          customerEmail: edit!.customerEmail || null,
          dueDate: edit!.dueDate || null,
          totalAmount: Number(edit!.totalAmount),
          amountOutstanding: Number(edit!.amountOutstanding),
          currency: data?.currency || "USD",
        }),
      }),
    onSuccess: () => {
      toast.success("Invoice corrected");
      setEdit(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const missed = useMemo(
    () => data?.promises.some((p) => p.status === "MISSED") ?? false,
    [data],
  );

  if (isLoading || !data) {
    return <p className="text-stone-500">Loading invoice…</p>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr] lg:gap-6">
      <div className="space-y-5 sm:space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status as never} />
            {missed ? (
              <span className="text-sm font-medium text-red-700">
                Payment promise missed
              </span>
            ) : null}
          </div>
          <h1 className="page-title mt-3">
            {data.customer?.companyName || data.customer?.name}
          </h1>
          <p className="mt-2 break-words text-sm text-stone-600 sm:text-base">
            Invoice #{data.invoiceNumber}
            {data.customer?.email ? ` · ${data.customer.email}` : ""}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="text-xs text-stone-500 sm:text-sm">Amount due</div>
              <div className="money text-xl font-semibold sm:text-3xl">
                {formatMoneyPrecise(data.amountOutstanding, data.currency)}
              </div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="text-xs text-stone-500 sm:text-sm">Due date</div>
              <div className="text-base font-medium sm:text-xl">
                {data.dueDate ? new Date(data.dueDate).toLocaleDateString() : "—"}
              </div>
              <div className="text-xs text-stone-500 sm:text-sm">
                {data.daysOverdue > 0 ? `${data.daysOverdue} days overdue` : "On schedule"}
              </div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Generate Follow-Up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(["friendly", "professional", "firm"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tone === t ? "default" : "outline"}
                  onClick={() => setTone(t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? "Generating…" : "Generate Follow-Up"}
            </Button>

            {draft ? (
              <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div>
                  <Label>Subject</Label>
                  <div className="mt-1 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
                    {draft.subject}
                  </div>
                </div>
                <div>
                  <Label>Message</Label>
                  <pre className="mt-1 whitespace-pre-wrap rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed">
                    {draft.message}
                  </pre>
                </div>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      await navigator.clipboard.writeText(draft.subject);
                      toast.success("Subject copied");
                    }}
                  >
                    Copy subject
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      await navigator.clipboard.writeText(draft.message);
                      toast.success("Message copied");
                    }}
                  >
                    Copy message
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => markSent.mutate()}
                    disabled={markSent.isPending}
                  >
                    Mark reminder as sent
                  </Button>
                </div>
                <p className="text-xs text-stone-500">
                  Recommended next chase in {draft.recommendedNextFollowUpDays} days.
                  You send the email manually.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm sm:text-base">Review / correct fields</CardTitle>
              {!edit ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEdit({
                      invoiceNumber: data.invoiceNumber,
                      customerName:
                        data.customer?.companyName || data.customer?.name || "",
                      customerEmail: data.customer?.email || "",
                      dueDate: data.dueDate
                        ? new Date(data.dueDate).toISOString().slice(0, 10)
                        : "",
                      totalAmount: String(data.totalAmount),
                      amountOutstanding: String(data.amountOutstanding),
                    })
                  }
                >
                  Edit
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {edit ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Invoice number</Label>
                    <Input
                      value={edit.invoiceNumber}
                      onChange={(e) =>
                        setEdit({ ...edit, invoiceNumber: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Customer</Label>
                    <Input
                      value={edit.customerName}
                      onChange={(e) =>
                        setEdit({ ...edit, customerName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Customer email</Label>
                    <Input
                      value={edit.customerEmail}
                      onChange={(e) =>
                        setEdit({ ...edit, customerEmail: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Due date</Label>
                    <Input
                      type="date"
                      value={edit.dueDate}
                      onChange={(e) =>
                        setEdit({ ...edit, dueDate: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Total amount</Label>
                    <Input
                      type="number"
                      value={edit.totalAmount}
                      onChange={(e) =>
                        setEdit({ ...edit, totalAmount: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Outstanding</Label>
                    <Input
                      type="number"
                      value={edit.amountOutstanding}
                      onChange={(e) =>
                        setEdit({ ...edit, amountOutstanding: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button onClick={() => correct.mutate()} disabled={correct.isPending}>
                    Save corrections
                  </Button>
                  <Button variant="ghost" onClick={() => setEdit(null)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-stone-500">
                Never silently trust uncertain extraction — edit any field before chasing.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collection timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.events.map((event) => (
              <div key={event.id} className="flex gap-3 border-l-2 border-stone-200 pl-3">
                <div>
                  <div className="text-sm font-medium">
                    {eventLabels[event.type] || event.type}
                  </div>
                  <div className="text-xs text-stone-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Invoice preview</CardTitle>
          </CardHeader>
          <CardContent>
            {data.sourceFileUrl ? (
              data.sourceMimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.sourceFileUrl}
                  alt="Invoice preview"
                  className="max-h-56 w-full rounded-lg bg-stone-50 object-contain sm:max-h-80"
                />
              ) : (
                <iframe
                  src={data.sourceFileUrl}
                  title="Invoice PDF"
                  className="h-56 w-full rounded-lg border border-stone-200 sm:h-80"
                />
              )
            ) : (
              <p className="text-sm text-stone-500">
                Demo invoice — no uploaded source file.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Add note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={!note || addNote.isPending}
                onClick={() => addNote.mutate()}
              >
                Add note
              </Button>
            </div>

            <div className="space-y-2 border-t border-stone-100 pt-4">
              <Label>Promise to pay</Label>
              <Input
                type="date"
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Amount"
                value={promiseAmount}
                onChange={(e) => setPromiseAmount(e.target.value)}
              />
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={!promiseDate || !promiseAmount || recordPromise.isPending}
                onClick={() => recordPromise.mutate()}
              >
                Record promise
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-4">
              <Button variant="outline" onClick={() => markDisputed.mutate()}>
                Mark disputed
              </Button>
              <Button onClick={() => markPaid.mutate()}>Mark paid</Button>
            </div>

            {data.nextFollowUpAt ? (
              <p className="text-sm text-stone-500">
                Next follow-up scheduled{" "}
                {new Date(data.nextFollowUpAt).toLocaleDateString()}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Follow-up history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.followUps.map((item) => (
              <div key={item.id} className="rounded-lg border border-stone-200 p-3 text-sm">
                <div className="font-medium">
                  {item.type} · {item.status}
                  {item.tone ? ` · ${item.tone.toLowerCase()}` : ""}
                </div>
                {item.subject ? (
                  <div className="text-stone-600">{item.subject}</div>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap text-stone-500">{item.message}</p>
              </div>
            ))}
            {!data.followUps.length ? (
              <p className="text-sm text-stone-500">No follow-ups yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
