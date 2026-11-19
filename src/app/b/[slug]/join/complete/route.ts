import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** After the customer confirms their email: join the business they signed up with, then open its app. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL(`/b/${slug}/login`, request.nextUrl.origin));
  const meta = auth.user.user_metadata as { full_name?: string; phone?: string };
  // Errors (e.g. account belongs to another business) are shown by the app's own gate screen.
  await supabase.rpc("join_business", { p_slug: slug, p_full_name: meta.full_name ?? null, p_phone: meta.phone ?? null });
  return NextResponse.redirect(new URL(`/b/${slug}`, request.nextUrl.origin));
}
