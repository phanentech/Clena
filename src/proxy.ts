import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

const PROTECTED_PREFIXES = ["/app", "/onboarding", "/customer", "/staff", "/driver", "/platform"];

/**
 * Refreshes the Supabase session cookie on every request and performs an
 * OPTIMISTIC redirect for signed-out users on protected areas. Real
 * authorization happens server-side in each layout/page/action and in RLS.
 */
export async function proxy(request: NextRequest) {
  // Supabase sends people to the Site URL (often "/") when a redirect isn't on its allow-list.
  // Catch the confirmation code wherever it lands and finish sign-in properly.
  const sp = request.nextUrl.searchParams;
  if (!request.nextUrl.pathname.startsWith("/auth/confirm") && !request.nextUrl.pathname.startsWith("/api/")
      && (sp.has("code") || (sp.has("token_hash") && sp.has("type")))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    return NextResponse.redirect(url);
  }
  // Supabase errors on the link itself (e.g. expired) arrive as ?error_code=…
  if (sp.has("error_code") && !request.nextUrl.pathname.startsWith("/auth/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = "?error=link_expired";
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() validates the JWT; do not put logic between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  if (!signedIn && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
