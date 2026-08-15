"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiSend } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type UploadResult = {
  summary: string;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amountOutstanding: number;
    currency: string;
    needsReview: boolean;
    customer?: { name: string; companyName?: string | null } | null;
    extraction: Record<string, { value: unknown; confidence: number }>;
  }>;
};

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function onUpload() {
    if (!files?.length) {
      toast.error("Choose one or more invoice PDFs or images.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("files", file));
      const data = await apiSend<UploadResult>("/api/invoices/upload", {
        method: "POST",
        body: form,
      });
      setResult(data);
      toast.success(data.summary);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="page-title">Upload Invoices</h1>
        <p className="mt-2 text-sm text-stone-600 sm:text-base">
          Find out who still owes you money. PDF, PNG, or JPG — multiple files welcome.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Drop invoices here</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label
            htmlFor="files"
            className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center active:bg-stone-100"
          >
            <span className="text-base font-medium text-stone-800">
              Tap to choose files
            </span>
            <span className="mt-1 text-sm text-stone-500">
              PDF, PNG, or JPG · multiple files OK
            </span>
            {files?.length ? (
              <span className="mt-3 text-sm font-medium text-teal-800">
                {files.length} file{files.length === 1 ? "" : "s"} selected
              </span>
            ) : null}
            <Input
              id="files"
              type="file"
              accept=".pdf,image/png,image/jpeg"
              multiple
              className="sr-only"
              onChange={(e) => setFiles(e.target.files)}
            />
          </label>
          <p className="text-sm text-stone-500">
            No products, tax setup, or accounting config required.
          </p>
          <Button onClick={onUpload} disabled={uploading} size="lg" className="w-full sm:w-auto">
            {uploading ? "Extracting…" : "Upload & Extract"}
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base leading-snug sm:text-lg">
              {result.summary}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="rounded-lg border border-stone-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {invoice.customer?.companyName || invoice.customer?.name} · #
                      {invoice.invoiceNumber}
                    </div>
                    <div className="mt-1 text-sm text-stone-500">
                      {invoice.needsReview
                        ? "Needs review — some fields have low confidence"
                        : "Extraction looks solid"}
                    </div>
                  </div>
                  <span className="money shrink-0 font-semibold">
                    {formatMoney(invoice.amountOutstanding, invoice.currency)}
                  </span>
                </div>
                <Button asChild variant="outline" className="mt-3 w-full sm:w-auto">
                  <Link href={`/invoices/${invoice.id}`}>Open</Link>
                </Button>
              </div>
            ))}
            <Button className="w-full sm:w-auto" onClick={() => router.push("/dashboard")}>
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
