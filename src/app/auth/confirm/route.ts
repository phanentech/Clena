import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

/**
 * Handles email confirmation, magic links and password-reset links.
 * Supports both the token_hash flow (recommended email template) and the PKCE `code` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/auth/continue");

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    // The email is already confirmed by the time Supabase hands out a code. If the code can't be
    // used here (link opened in another browser or on another phone), just ask them to sign in.
    if (!ok && type !== "recovery") {
      const url = new URL("/auth/login", origin);
      url.searchParams.set("confirmed", "1");
      if (next && next !== "/auth/continue") url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/auth/login?error=link_expired", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
