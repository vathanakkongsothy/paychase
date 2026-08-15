import OpenAI from "openai";
import {
  followUpGenerationSchema,
  invoiceExtractionSchema,
  type ExtractionProvider,
  type FollowUpProvider,
  type InvoiceExtractionResult,
} from "@/server/ai/types";

function heuristicExtraction(fileName: string): InvoiceExtractionResult {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const numberMatch = fileName.match(/INV[_-]?(\d{3,})/i);
  const invoiceNumber = numberMatch
    ? `INV-${numberMatch[1]}`
    : `INV-${Math.floor(1000 + Math.random() * 9000)}`;
  const seed = [...invoiceNumber].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const totalAmount = 250 + (seed % 40) * 50; // $250–$2,200
  const daysOverdue = 3 + (seed % 28);

  return {
    invoiceNumber: { value: invoiceNumber, confidence: 0.45 },
    customerName: {
      value: base.replace(/^invoice\s+\d+\s+/i, "").slice(0, 48) || "Unknown Customer",
      confidence: 0.3,
    },
    customerEmail: { value: null, confidence: 0.1 },
    issueDate: {
      value: new Date(Date.now() - (daysOverdue + 14) * 86400000)
        .toISOString()
        .slice(0, 10),
      confidence: 0.25,
    },
    dueDate: {
      value: new Date(Date.now() - daysOverdue * 86400000).toISOString().slice(0, 10),
      confidence: 0.25,
    },
    currency: { value: "USD", confidence: 0.5 },
    subtotal: { value: Math.round(totalAmount / 1.1), confidence: 0.2 },
    tax: { value: totalAmount - Math.round(totalAmount / 1.1), confidence: 0.2 },
    totalAmount: { value: totalAmount, confidence: 0.25 },
    paymentStatus: { value: null, confidence: 0.1 },
    purchaseOrderRef: { value: null, confidence: 0.1 },
  };
}

function buildReminder(input: Parameters<FollowUpProvider["generateReminder"]>[0]) {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: input.currency || "USD",
  }).format(input.amount);

  let tone: "friendly" | "professional" | "firm" = input.tone ?? "friendly";
  if (!input.tone) {
    if (input.missedPromise || input.daysOverdue >= 14) tone = "firm";
    else if (input.daysOverdue >= 7) tone = "professional";
    else tone = "friendly";
  }

  const due = input.dueDate ? `due ${input.dueDate}` : "now due";
  const overdueBit =
    input.daysOverdue > 0 ? ` It is currently ${input.daysOverdue} days overdue.` : "";

  let subject = `Payment reminder for Invoice #${input.invoiceNumber}`;
  let message = "";
  let recommendedNextFollowUpDays = 5;

  if (input.missedPromise) {
    subject = `Follow-up on promised payment — Invoice #${input.invoiceNumber}`;
    message = `Hi ${input.customerName},\n\nI'm following up because the payment you promised for Invoice #${input.invoiceNumber} (${amount}) appears to have been missed.\n\nCould you please confirm when payment will be completed, or let me know if anything is blocking it?\n\nThank you,\nAccounts Receivable`;
    recommendedNextFollowUpDays = 2;
    tone = "firm";
  } else if (tone === "friendly") {
    message = `Hi ${input.customerName},\n\nI hope you're doing well. This is a friendly reminder that Invoice #${input.invoiceNumber} for ${amount} was ${due}.${overdueBit}\n\nWhen you have a moment, could you confirm the payment status or share an expected payment date?\n\nThank you,\nAccounts Receivable`;
    recommendedNextFollowUpDays = 5;
  } else if (tone === "professional") {
    message = `Hello ${input.customerName},\n\nI'm writing regarding Invoice #${input.invoiceNumber} for ${amount}, which was ${due}.${overdueBit}\n\nPlease arrange payment at your earliest convenience, or reply with a confirmed payment date if payment is already in progress.\n\nBest regards,\nAccounts Receivable`;
    recommendedNextFollowUpDays = 3;
  } else {
    message = `Hello ${input.customerName},\n\nInvoice #${input.invoiceNumber} for ${amount} remains unpaid and was ${due}.${overdueBit}\n\nPlease process payment as soon as possible and reply with confirmation once it has been sent. If there is a dispute or issue, let us know so we can resolve it.\n\nRegards,\nAccounts Receivable`;
    recommendedNextFollowUpDays = 2;
  }

  return followUpGenerationSchema.parse({
    subject,
    message,
    tone,
    recommendedNextFollowUpDays,
  });
}

export class HeuristicExtractionProvider implements ExtractionProvider {
  async extractInvoice(input: { fileName: string }) {
    return {
      data: heuristicExtraction(input.fileName),
      model: "heuristic-v1",
    };
  }
}

export class HeuristicFollowUpProvider implements FollowUpProvider {
  async generateReminder(input: Parameters<FollowUpProvider["generateReminder"]>[0]) {
    return { ...buildReminder(input), model: "heuristic-v1" };
  }
}

export class OpenAIExtractionProvider implements ExtractionProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async extractInvoice(input: {
    fileName: string;
    mimeType: string;
    base64Data: string;
  }) {
    const isImage = input.mimeType.startsWith("image/");
    const prompt = `Extract invoice fields from this document. Return strict JSON matching this schema keys:
invoiceNumber, customerName, customerEmail, issueDate (YYYY-MM-DD), dueDate (YYYY-MM-DD), currency, subtotal, tax, totalAmount, paymentStatus, purchaseOrderRef.
Each field must be an object { "value": ..., "confidence": 0-1 }.
Never invent late fees or legal claims. Use null for unknown values with low confidence.
File name hint: ${input.fileName}`;

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: prompt },
    ];

    if (isImage) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${input.mimeType};base64,${input.base64Data}`,
        },
      });
    } else {
      content.push({
        type: "text",
        text: `Document is a PDF named ${input.fileName}. Base64 length: ${input.base64Data.length}. If you cannot read binary PDF content reliably, extract best-effort from filename and mark confidence low.`,
      });
    }

    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract structured invoice data. Never silently invent uncertain values; set confidence low and value null when unsure.",
        },
        { role: "user", content },
      ],
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = invoiceExtractionSchema.parse(JSON.parse(raw));
    return { data: parsed, model: "gpt-4o-mini" };
  }
}

export class OpenAIFollowUpProvider implements FollowUpProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateReminder(input: Parameters<FollowUpProvider["generateReminder"]>[0]) {
    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You write professional accounts-receivable follow-ups.
Rules:
- Never threaten customers
- Never invent late fees
- Never invent legal obligations
- Never claim actions not supported by the invoice/account
Return JSON: { subject, message, tone: friendly|professional|firm, recommendedNextFollowUpDays }`,
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = followUpGenerationSchema.parse(JSON.parse(raw));
    return { ...parsed, model: "gpt-4o-mini" };
  }
}

export function getExtractionProvider(): ExtractionProvider {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) return new OpenAIExtractionProvider(key);
  return new HeuristicExtractionProvider();
}

export function getFollowUpProvider(): FollowUpProvider {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) return new OpenAIFollowUpProvider(key);
  return new HeuristicFollowUpProvider();
}
