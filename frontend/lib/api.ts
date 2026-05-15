// API client — all calls to the FastAPI backend at NEXT_PUBLIC_API_URL/api/v1

import { supabase } from "./supabase";

export const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

async function waitForSession() {
  let session = (await supabase.auth.getSession()).data.session;
  if (!session) {
    session = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 3000);
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, s) => {
          if (s) {
            clearTimeout(timeout);
            subscription.unsubscribe();
            resolve(s);
          }
        }
      );
    });
  }
  return session;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = await waitForSession();
  if (!session) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`,
  };
}

async function getAuthHeadersFormData(): Promise<HeadersInit> {
  const session = await waitForSession();
  if (!session) throw new Error("Not authenticated");
  return { "Authorization": `Bearer ${session.access_token}` };
}

// ── Error type ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Interfaces — mirror Pydantic schemas exactly ──────────────────────────────

export interface DateRange {
  start: string;
  end: string;
}

// Upload
export interface UploadResponse {
  upload_id: string;
  filename: string;
  doc_type: "gst_notice" | "invoice" | "bank_statement";
  extracted_text_preview: string;
  status: string;
}

export interface BankStatementUploadResponse {
  upload_id: string;
  rows_parsed: number;
  date_range: DateRange;
  status: string;
}

// Agents
export interface AgentResponse {
  agent: string;
  summary: string;
  structured_data: Record<string, unknown>;
  action_items: string[];
  confidence: number;
  raw_llm_output: string;
}

// Query responses — orchestrator always returns OrchestratorResponse shape
export interface GSTNoticeResponse {
  agents_invoked: string[];
  responses: AgentResponse[];
  integrated_insight: string | null;
}

export type FinanceResponse = GSTNoticeResponse;
export type IntegratedResponse = GSTNoticeResponse;

// Typed views into AgentResponse.structured_data for each agent
export interface GSTStructuredData {
  notice_type?: string;
  reason?: string;
  deadline?: string;
  tax_amount?: number;
  applicable_sections?: string[];
  requires_legal_help?: boolean;
}

export interface FinanceStructuredData {
  total_inflow?: number;
  total_outflow?: number;
  net?: number;
  health_score?: number;
  anomalies?: Array<{
    date: string;
    description: string;
    reason: string;
    amount: number;
  }>;
}

export interface ComplianceStructuredData {
  action_checklist?: Array<{
    task: string;
    deadline: string;
    priority: "high" | "medium" | "low";
  }>;
  draft_reply?: string;
  documents_needed?: string[];
  upcoming_deadlines?: Array<{
    form: string;
    due_date: string;
    description: string;
  }>;
}

// Ask
export interface AskResponse {
  answer: string;
  source: string;
}

// Invoices
export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  total?: number;
}

export interface InvoiceGenerateRequest {
  vendor_name: string;
  vendor_gstin?: string;
  buyer_name: string;
  buyer_gstin?: string;
  line_items: LineItem[];
}

export interface InvoiceSendRequest {
  invoice_id: string;
  recipient_email: string;
  message: string;
}

export interface InvoiceResponse {
  invoice_id: string;
  upload_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  vendor_name?: string;
  vendor_gstin?: string;
  buyer_name?: string;
  buyer_gstin?: string;
  line_items?: LineItem[];
  subtotal?: number;
  total_gst?: number;
  grand_total?: number;
  invoice_type?: "received" | "issued";
  payment_due_date?: string;
  summary?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface Invoice {
  id: string;
  invoice_number?: string;
  invoice_date?: string;
  vendor_name?: string;
  vendor_gstin?: string;
  buyer_name?: string;
  buyer_gstin?: string;
  grand_total?: number;
  total_gst?: number;
  invoice_type?: "received" | "issued";
  upload_id?: string;
  created_at?: string;
  sent_at?: string;
}

export interface SendResponse {
  sent: boolean;
  message_id: string;
  sent_at: string;
  recipient: string;
  subject: string;
}

// Compliance
export interface Deadline {
  form: string;
  description: string;
  due_date: string;
  days_remaining: number;
  urgency: "overdue" | "urgent" | "soon" | "upcoming";
}

export interface DeadlinesResponse {
  as_of: string;
  deadlines: Deadline[];
}

// Backend error shape (detail field from FastAPI HTTPException)
interface BackendError {
  error: boolean;
  code: string;
  message: string;
  detail?: string;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${BASE}${path}`;

  const res = await fetch(url, { ...init });

  if (!res.ok) {
    let code = "HTTP_ERROR";
    let message = `Request failed with status ${res.status}`;
    let detail: string | undefined;

    try {
      const body = (await res.json()) as { detail?: BackendError | string };
      const d = body.detail;
      if (d && typeof d === "object") {
        code = d.code ?? code;
        message = d.message ?? message;
        detail = d.detail;
      } else if (typeof d === "string") {
        message = d;
      }
    } catch {
      // response body wasn't JSON — keep defaults
    }

    throw new ApiError(res.status, code, message, detail);
  }

  return res.json() as Promise<T>;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadDocument(
  file: File,
  docType: string,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  return request<UploadResponse>("/upload/document", {
    method: "POST",
    body: form,
    headers: await getAuthHeadersFormData(),
  });
}

export async function uploadBankStatement(
  file: File,
): Promise<BankStatementUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return request<BankStatementUploadResponse>("/upload/bank-statement", {
    method: "POST",
    body: form,
    headers: await getAuthHeadersFormData(),
  });
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function queryGSTNotice(uploadId: string): Promise<GSTNoticeResponse> {
  return request<GSTNoticeResponse>("/query/gst-notice", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ upload_id: uploadId }),
  });
}

export async function queryFinance(uploadId: string): Promise<FinanceResponse> {
  return request<FinanceResponse>("/query/finance", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ upload_id: uploadId }),
  });
}

export async function queryIntegrated(
  gstUploadId: string,
  financeUploadId: string,
): Promise<IntegratedResponse> {
  return request<IntegratedResponse>("/query/integrated", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      gst_upload_id: gstUploadId,
      finance_upload_id: financeUploadId,
    }),
  });
}

export async function askQuestion(question: string): Promise<AskResponse> {
  return request<AskResponse>("/query/ask", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ question }),
  });
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function extractInvoice(uploadId: string): Promise<InvoiceResponse> {
  return request<InvoiceResponse>("/invoices/extract", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ upload_id: uploadId }),
  });
}

export async function generateInvoice(
  data: InvoiceGenerateRequest,
): Promise<InvoiceResponse> {
  return request<InvoiceResponse>("/invoices/generate", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function sendInvoice(data: InvoiceSendRequest): Promise<SendResponse> {
  return request<SendResponse>("/invoices/send", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export async function listInvoices(type?: string, limit = 20): Promise<Invoice[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (type) params.set("type", type);
  const res = await request<{ invoices: Invoice[]; total: number }>(
    `/invoices?${params.toString()}`,
    { headers: await getAuthHeaders() },
  );
  return res.invoices;
}

// ── Compliance ────────────────────────────────────────────────────────────────

export async function getDeadlines(): Promise<DeadlinesResponse> {
  return request<DeadlinesResponse>("/compliance/deadlines", {
    headers: await getAuthHeaders(),
  });
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  user_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  business_name: string | null;
  gstin: string | null;
  updated_at: string | null;
}

export interface ProfileUpdateRequest {
  name?: string | null;
  phone?: string | null;
  business_name?: string | null;
  gstin?: string | null;
}

export async function getProfile(): Promise<UserProfile> {
  return request<UserProfile>("/users/profile", {
    headers: await getAuthHeaders(),
  });
}

export async function updateProfile(data: ProfileUpdateRequest): Promise<void> {
  await request<{ ok: boolean }>("/users/profile", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

// ── Uploads list ──────────────────────────────────────────────────────────────

export interface UploadRecord {
  id: string;
  filename: string;
  doc_type: "gst_notice" | "invoice" | "bank_statement";
  created_at: string;
}

export async function listUploads(limit = 10): Promise<UploadRecord[]> {
  const res = await request<{ uploads: Array<UploadRecord & { file_type?: string }> }>(
    `/upload/list?limit=${limit}`,
    { headers: await getAuthHeaders() },
  );
  // Backend returns `file_type` (Supabase column name); normalise to `doc_type`
  return (res.uploads ?? []).map((u) => ({
    ...u,
    doc_type: (u.doc_type ?? u.file_type) as UploadRecord["doc_type"],
  }));
}

export async function deleteUpload(uploadId: string): Promise<void> {
  await request<{ deleted: boolean }>(`/upload/${uploadId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
}

// ── Letterhead ────────────────────────────────────────────────────────────────

export async function uploadLetterhead(file: File): Promise<void> {
  const headers = await getAuthHeaders();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/users/letterhead`, {
    method: "POST",
    headers: { Authorization: (headers as Record<string, string>).Authorization },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err?.detail?.code ?? "UPLOAD_ERROR", err?.detail?.message ?? "Letterhead upload failed");
  }
}

export async function deleteLetterhead(): Promise<void> {
  await request<{ ok: boolean }>("/users/letterhead", {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export type ChatTopic = "compliance" | "invoice" | "finance" | "misc";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Stream a chat response from the backend.
 * Returns a ReadableStreamDefaultReader<string> so the caller can consume chunks.
 */
export async function streamChat(
  message: string,
  topic: ChatTopic,
  history: ChatMessage[],
): Promise<ReadableStreamDefaultReader<string>> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, topic, history }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed: ${res.status}`);
  }
  return res.body
    .pipeThrough(new TextDecoderStream())
    .getReader();
}

// ── Saved chats ───────────────────────────────────────────────────────────────

export interface ChatRecord {
  id: string;
  topic: ChatTopic;
  title: string;
  updated_at: string;
  created_at: string;
  messages?: ChatMessage[];
}

export async function listChats(): Promise<ChatRecord[]> {
  const res = await request<{ chats: ChatRecord[] }>("/chats", {
    headers: await getAuthHeaders(),
  });
  return res.chats;
}

export async function getChat(chatId: string): Promise<ChatRecord> {
  return request<ChatRecord>(`/chats/${chatId}`, {
    headers: await getAuthHeaders(),
  });
}

export async function saveChat(
  id: string,
  topic: ChatTopic,
  title: string,
  messages: ChatMessage[],
): Promise<void> {
  await request<{ ok: boolean }>(`/chats/${id}`, {
    method: "PUT",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ id, topic, title, messages }),
  });
}

export async function deleteSavedChat(chatId: string): Promise<void> {
  await request<{ ok: boolean }>(`/chats/${chatId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
}

// ── Invoice PDF download ───────────────────────────────────────────────────────

export async function downloadInvoicePdf(invoiceId: string, filename = "invoice.pdf"): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/invoices/${invoiceId}/pdf`, { headers });
  if (!res.ok) throw new Error("Could not generate PDF");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
