"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "@/lib/env";

/** Browser client — uses the public key only; every query is subject to RLS. */
export function createClient() {
  const { supabaseUrl, supabaseKey } = requireSupabaseEnv();
  return createBrowserClient(supabaseUrl, supabaseKey);
}
