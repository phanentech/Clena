import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/lib/auth/permissions";

export const ACTIVE_TENANT_COOKIE = "clena_tenant";

export type SessionUser = { id: string; email: string | null; fullName: string | null };

export type Membership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roleKey: string;
  roleName: string;
  permissions: Permission[];
  onboardingCompleted: boolean;
  isDemo: boolean;
};

/** The authenticated user (validated with the Auth server), or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    fullName: (data.user.user_metadata?.full_name as string | undefined) ?? null,
  };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/** Memberships are read from the database (never from client input). */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_memberships");
  if (error) throw new Error(`Could not load memberships: ${error.message}`);
  return (data ?? []).map((m: Record<string, unknown>) => ({
    tenantId: m.tenant_id as string,
    tenantName: m.tenant_name as string,
    tenantSlug: m.tenant_slug as string,
    roleKey: m.role_key as string,
    roleName: m.role_name as string,
    permissions: (m.permissions as Permission[]) ?? [],
    onboardingCompleted: Boolean(m.onboarding_completed),
    isDemo: Boolean(m.is_demo),
  }));
});

/**
 * The active tenant for this request. The cookie only expresses a PREFERENCE;
 * it is honoured only if the user is an active member of that tenant.
 */
export const getActiveMembership = cache(async (): Promise<Membership | null> => {
  const memberships = await getMemberships();
  if (memberships.length === 0) return null;
  const preferred = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
  return memberships.find((m) => m.tenantId === preferred) ?? memberships[0];
});

/** Use at the top of every /app page and server action. */
export async function requireTenant(permission?: Permission): Promise<{ user: SessionUser; membership: Membership }> {
  const user = await requireUser("/app/dashboard");
  const membership = await getActiveMembership();
  if (!membership) {
    const supabase = await createClient();
    const { data: suspended } = await supabase.rpc("my_suspended_tenants");
    redirect(suspended && suspended.length > 0 ? "/suspended" : "/onboarding");
  }
  if (permission && !membership.permissions.includes(permission)) {
    redirect("/app/forbidden");
  }
  return { user, membership };
}

export function can(membership: Membership, permission: Permission) {
  return membership.permissions.includes(permission);
}

/** For server actions: throw instead of redirecting. */
export async function assertPermission(permission: Permission) {
  const user = await getUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  const membership = await getActiveMembership();
  if (!membership) throw new Error("You are not a member of any business.");
  if (!membership.permissions.includes(permission)) {
    throw new Error("You do not have permission to do that.");
  }
  return { user, membership };
}

export const getPlatformRole = cache(async (): Promise<string | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  return data?.role ?? null;
});

/** Customer records linked to this login (one per business they buy from). */
export const getCustomerProfiles = cache(async () => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, tenant_id, tenants(name, slug, currency)")
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export type PlatformAccess = { role: string; roleName: string; permissions: string[] };

/** Platform console access for the signed-in user (null for ordinary users). */
export const getPlatformAccess = cache(async (): Promise<PlatformAccess | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: me } = await supabase.from("platform_admins").select("role, platform_roles(name)").eq("user_id", user.id).maybeSingle();
  if (!me) return null;
  let permissions: string[];
  if (me.role === "super_admin") {
    const { data } = await supabase.from("platform_permissions").select("key");
    permissions = (data ?? []).map((p) => p.key);
  } else {
    const { data } = await supabase.from("platform_role_permissions").select("permission_key").eq("role_key", me.role);
    permissions = (data ?? []).map((p) => p.permission_key);
  }
  const roleName = (Array.isArray(me.platform_roles) ? me.platform_roles[0]?.name : (me.platform_roles as { name: string } | null)?.name) ?? me.role;
  return { role: me.role, roleName, permissions };
});

export async function requirePlatform(permission?: string) {
  const user = await requireUser("/platform");
  const access = await getPlatformAccess();
  if (!access) redirect("/auth/continue");
  if (permission && !access.permissions.includes(permission)) redirect("/platform/organizations?denied=1");
  return { user, access };
}

export async function assertPlatform(permission: string) {
  const user = await getUser();
  const access = await getPlatformAccess();
  if (!user || !access || !access.permissions.includes(permission)) throw new Error("You do not have permission to do that.");
  return { user, access };
}
