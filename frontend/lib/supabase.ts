import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const signInWithOtp = async (email: string) => {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
};

export const verifyOtp = async (email: string, token: string) => {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// ── Database types ──────────────────────────────────────────────────────────

export interface DbUpload {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  file_type: "gst_notice" | "invoice" | "bank_statement";
  analysis_status: "pending" | "complete" | "failed";
  uploaded_at: string;
  analyses?: DbAnalysis[];
}

export interface DbAnalysis {
  id: string;
  upload_id: string;
  user_id: string;
  analysis_type: string;
  result_json: {
    agents_invoked: string[];
    responses: Array<{
      agent: string;
      summary: string;
      structured_data: Record<string, unknown>;
      action_items: string[];
      confidence: number;
      raw_llm_output: string;
    }>;
    integrated_insight: string | null;
  };
  todo_items: Array<{ task: string; deadline?: string; priority?: "high" | "medium" | "low" }>;
  created_at: string;
}

export interface DbUserProfile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  business_name: string | null;
  created_at?: string;
  updated_at?: string;
}

// ── Database query helpers ──────────────────────────────────────────────────

export async function getUploadsWithAnalyses(fileType?: string, limit = 20): Promise<DbUpload[]> {
  let query = supabase
    .from("uploads")
    .select("*, analyses(*)")
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  if (fileType) query = query.eq("file_type", fileType);
  const { data, error } = await query;
  if (error) throw error;
  return (data as DbUpload[]) ?? [];
}

export async function getUserProfile(): Promise<DbUserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as DbUserProfile | null;
}

export async function upsertUserProfile(
  profile: Partial<Omit<DbUserProfile, "id" | "created_at" | "updated_at">> & { id: string }
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .upsert({ ...profile, updated_at: new Date().toISOString() });
  if (error) throw error;
}
