import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { APP_NAV, NEW_ACTIONS } from "@/components/app/nav";
import { getMemberships, requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasLaundryOps } from "@/lib/ops";
import { signOut } from "@/app/auth/actions";
import { switchTenant } from "./actions";
import { getLocale, getMessages } from "@/lib/i18n/server";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Clena" }, robots: { index: false } };

export default async function BusinessAppLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requireTenant();
  const memberships = await getMemberships();
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("settings").eq("id", membership.tenantId).single();
  const has = (p: string) => membership.permissions.includes(p as never);
  const [t, locale, laundry] = await Promise.all([getMessages(), getLocale(), hasLaundryOps(membership.tenantId)]);
  const navT = t.nav as Record<string, string>;

  const nav = APP_NAV.map((g) => ({ ...g, label: navT[g.key ?? ""] ?? g.label, items: g.items.filter((i) => has(i.permission) && (!i.module || laundry)).map((i) => ({ ...i, label: navT[i.key ?? ""] ?? i.label })) })).filter((g) => g.items.length > 0);
  const newActions = NEW_ACTIONS.filter((a) => has(a.permission)).map(({ href, label, key }) => ({ href, label: navT[key] ?? label }));

  return (
    <AppShell
      nav={nav}
      newActions={newActions}
      user={{ fullName: user.fullName, email: user.email }}
      tenant={{
        id: membership.tenantId, name: membership.tenantName, roleName: membership.roleName, isDemo: membership.isDemo,
        hasSampleData: Boolean((tenant?.settings as Record<string, unknown> | null)?.demo_data_loaded_at) && !membership.isDemo,
      }}
      tenants={memberships.map((m) => ({ id: m.tenantId, name: m.tenantName }))}
      switchTenant={switchTenant}
      signOut={signOut}
      locale={locale}
      labels={{ search: t.nav.searchPlaceholder, switchBusiness: t.nav.switchBusiness, signOut: t.common.signOut, sampleLoaded: t.nav.sampleLoaded, manage: t.nav.manage, more: t.nav.more, new: t.common.new, language: t.common.language }}
    >
      {children}
    </AppShell>
  );
}
