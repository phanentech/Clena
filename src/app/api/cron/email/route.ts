import { NextResponse, type NextRequest } from "next/server";
import { processEmailOutbox } from "@/lib/email";

/** Retries queued emails. Call from Vercel Cron with the CRON_SECRET bearer token. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await processEmailOutbox(50));
}
