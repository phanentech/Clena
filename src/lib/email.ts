import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";

/**
 * Sends queued emails from public.email_outbox through Resend.
 * Without RESEND_API_KEY the emails are marked "skipped" with a clear reason;
 * nothing is ever reported as sent unless the provider accepted it.
 */
export async function processEmailOutbox(limit = 20) {
  const admin = createAdminClient();
  const { data: queued, error } = await admin.from("email_outbox").select("id, to_email, subject, body_text, attempts")
    .eq("status", "queued").order("created_at").limit(limit);
  if (error) throw new Error(error.message);
  const from = process.env.EMAIL_FROM ?? "Clena <notifications@clena.app>";
  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const mail of queued ?? []) {
    if (!serverEnv.resendApiKey) {
      await admin.from("email_outbox").update({ status: "skipped", error: "Email provider not configured (RESEND_API_KEY missing)", attempts: mail.attempts + 1 }).eq("id", mail.id);
      results.skipped++;
      continue;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${serverEnv.resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [mail.to_email], subject: mail.subject, text: mail.body_text }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? `Resend responded ${res.status}`);
      await admin.from("email_outbox").update({ status: "sent", provider: "resend", provider_message_id: body.id ?? null, sent_at: new Date().toISOString(), attempts: mail.attempts + 1, error: null }).eq("id", mail.id);
      results.sent++;
    } catch (e) {
      const attempts = mail.attempts + 1;
      await admin.from("email_outbox").update({ status: attempts >= 5 ? "failed" : "queued", error: (e as Error).message, attempts }).eq("id", mail.id);
      results.failed++;
    }
  }
  return results;
}
