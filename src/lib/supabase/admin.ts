import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Privileged client that BYPASSES Row Level Security.
 * Only for trusted server code paths that have already authorized the caller
 * or that run without a user (payment webhooks, background jobs).
 * Never use it to serve an ordinary user request.
 */
export function createAdminClient() {
  const { supabaseUrl } = requireSupabaseEnv();
  if (!serverEnv.supabaseSecretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set (server-only).");
  }
  return createSupabaseClient(supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
