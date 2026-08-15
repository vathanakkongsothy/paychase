import { z } from "zod";

export const extractedFieldSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    confidence: z.number().min(0).max(1),
  });

export const invoiceExtractionSchema = z.object({
  invoiceNumber: extractedFieldSchema(z.string().nullable()),
  customerName: extractedFieldSchema(z.string().nullable()),
  customerEmail: extractedFieldSchema(z.string().nullable()),
  issueDate: extractedFieldSchema(z.string().nullable()),
  dueDate: extractedFieldSchema(z.string().nullable()),
  currency: extractedFieldSchema(z.string().nullable()),
  subtotal: extractedFieldSchema(z.number().nullable()),
  tax: extractedFieldSchema(z.number().nullable()),
  totalAmount: extractedFieldSchema(z.number().nullable()),
  paymentStatus: extractedFieldSchema(z.string().nullable()),
  purchaseOrderRef: extractedFieldSchema(z.string().nullable()),
});

export type InvoiceExtractionResult = z.infer<typeof invoiceExtractionSchema>;

export const followUpGenerationSchema = z.object({
  subject: z.string(),
  message: z.string(),
  tone: z.enum(["friendly", "professional", "firm"]),
  recommendedNextFollowUpDays: z.number().int().min(1).max(30),
});

export type FollowUpGenerationResult = z.infer<typeof followUpGenerationSchema>;

export type ExtractionProvider = {
  extractInvoice(input: {
    fileName: string;
    mimeType: string;
    base64Data: string;
  }): Promise<{
    data: InvoiceExtractionResult;
    model: string;
  }>;
};

export type FollowUpProvider = {
  generateReminder(input: {
    customerName: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    dueDate: string | null;
    daysOverdue: number;
    status: string;
    previousReminders: Array<{ subject: string | null; message: string; sentAt: string | null }>;
    customerNotes: string | null;
    tone?: "friendly" | "professional" | "firm";
    missedPromise?: boolean;
  }): Promise<FollowUpGenerationResult & { model: string }>;
};
