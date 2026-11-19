/**
 * Environment access. Public values are inlined by Next at build time
 * (NEXT_PUBLIC_*). Server secrets live in src/lib/env.server.ts so they can
 * never be imported into client bundles.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Supabase's new "publishable" key; falls back to the legacy anon key name.
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export function isSupabaseConfigured() {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseKey);
}

export function requireSupabaseEnv() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see docs/ENVIRONMENT.md).",
    );
  }
  return publicEnv;
}
