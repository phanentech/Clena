import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homeForRole } from "@/lib/auth/permissions";

/** Routes a freshly signed-in user to the right experience based on their database memberships. */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/auth/login", origin));

  // Join any business that invited this email address.
  await supabase.rpc("accept_my_invitations");

  const [{ data: memberships }, { data: platform }, { data: customers }] = await Promise.all([
    supabase.rpc("my_memberships"),
    supabase.from("platform_admins").select("role").eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("customers").select("id, tenants(slug)").eq("user_id", auth.user.id).limit(1),
  ]);

  if (memberships && memberships.length > 0) {
    const first = memberships[0] as { role_key: string; onboarding_completed: boolean };
    if (first.role_key === "owner" && !first.onboarding_completed) {
      return NextResponse.redirect(new URL("/onboarding", origin));
    }
    return NextResponse.redirect(new URL(homeForRole(first.role_key), origin));
  }
  if (platform) return NextResponse.redirect(new URL("/platform", origin));
  if (customers && customers.length > 0) {
    const slug = (customers[0].tenants as unknown as { slug: string } | null)?.slug;
    return NextResponse.redirect(new URL(slug ? `/b/${slug}` : "/customer", origin));
  }
  const joinSlug = (auth.user.user_metadata as { join_slug?: string } | null)?.join_slug;
  if (joinSlug && /^[a-z0-9-]{3,48}$/.test(joinSlug)) return NextResponse.redirect(new URL(`/b/${joinSlug}/join/complete`, origin));
  return NextResponse.redirect(new URL("/onboarding/business", origin));
}
