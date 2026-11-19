import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Badge } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { signOut } from "@/app/auth/actions";
import { PlatformTabs } from "./tabs";

export const metadata: Metadata = { title: { default: "Platform", template: "%s · Clena platform" }, robots: { index: false } };

const TABS = [
  { href: "/platform/organizations", label: "Organizations", icon: "Building2", perm: "tenants.view" },
  { href: "/platform/ai-models", label: "AI Models", icon: "Bot", perm: "ai.manage" },
  { href: "/platform/branding", label: "Branding & Platform", icon: "Palette", perm: "platform.settings" },
  { href: "/platform/plans", label: "Pricing Plans", icon: "Receipt", perm: "plans.manage" },
  { href: "/platform/billing", label: "Billing & payments", icon: "CreditCard", perm: "billing.view" },
  { href: "/platform/marketing", label: "Marketing", icon: "Megaphone", perm: "marketing.manage" },
  { href: "/platform/helpdesk", label: "Help Desk", icon: "LifeBuoy", perm: "helpdesk.manage" },
  { href: "/platform/partners", label: "Partners", icon: "Handshake", perm: "partners.manage" },
  { href: "/platform/roles", label: "Roles & Permissions", icon: "ShieldCheck", perm: "users.manage" },
  { href: "/platform/users", label: "Users", icon: "Users", perm: "users.manage" },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, access } = await requirePlatform();
  const supabase = await createClient();
  const { data: overview } = await supabase.rpc("platform_overview");
  const o = (overview ?? {}) as Record<string, number>;
  const tabs = TABS.filter((t) => access.permissions.includes(t.perm)).map(({ perm, ...t }) => ({
    ...t,
    badge: perm === "billing.view" ? o.awaiting_transfers : perm === "helpdesk.manage" ? o.open_tickets : undefined,
  }));
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <LogoMark className="size-7 shrink-0" />
            <span className="whitespace-nowrap text-[14px] font-semibold"><span className="hidden sm:inline">Clena </span>Platform</span>
            <Badge tone="info" className="whitespace-nowrap">{access.roleName}</Badge>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[13px] sm:gap-4">
            <Link href="/app/dashboard" className="whitespace-nowrap text-muted hover:text-ink"><span className="sm:hidden">App</span><span className="hidden sm:inline">Business app</span></Link>
            <span className="hidden text-muted md:inline">{user.email}</span>
            <form action={signOut}><button type="submit" aria-label="Sign out" className="flex items-center gap-1.5 whitespace-nowrap text-muted hover:text-ink"><LogOut className="size-4" /><span className="hidden sm:inline">Sign out</span></button></form>
          </div>
        </div>
        <div className="mx-auto max-w-[1400px] px-4"><PlatformTabs tabs={tabs} /></div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
    </div>
  );
}
