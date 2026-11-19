import { NextResponse, type NextRequest } from "next/server";
import { processEmailOutbox } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily job, called by Vercel Cron with the CRON_SECRET bearer token:
 * 1. laundry operations: service reminders, late-order incidents, subscription renewals and expiry
 * 2. sends queued emails (including the reminders just created)
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let ops: unknown = null;
  try {
    const { data, error } = await createAdminClient().rpc("run_daily_ops");
    ops = error ? { error: error.message } : data;
  } catch (e) {
    ops = { error: (e as Error).message };
  }
  return NextResponse.json({ ops, email: await processEmailOutbox(100) });
}
