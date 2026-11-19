import "server-only";

/** Server-only secrets. Importing this file from a Client Component fails the build. */
export const serverEnv = {
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  aiProvider: process.env.AI_PROVIDER ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
};
