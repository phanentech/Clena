"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3, CalendarDays, ChevronDown, ClipboardList, LayoutDashboard, LifeBuoy, LogOut, Menu, MessagesSquare, TicketPercent, Plus, Search, Settings, Tags, UserCog, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

const ICONS: Record<string, LucideIcon> = { LayoutDashboard, ClipboardList, CalendarDays, Users, Wallet, BarChart3, Tags, UserCog, Settings, LifeBuoy, MessagesSquare, TicketPercent };

type Props = {
  nav: NavGroup[];
  newActions: { href: string; label: string }[];
  user: { fullName: string | null; email: string | null };
  tenant: { id: string; name: string; roleName: string; isDemo: boolean; hasSampleData: boolean };
  tenants: { id: string; name: string }[];
  switchTenant: (formData: FormData) => Promise<void>;
  signOut: () => Promise<void>;
  locale: string;
  labels: { search: string; switchBusiness: string; signOut: string; sampleLoaded: string; manage: string; more: string; new: string; language: string };
  children: React.ReactNode;
};

/** Closes a <details> menu when clicking outside it or navigating. */
function useAutoClose(ref: React.RefObject<HTMLDetailsElement | null>, pathname: string) {
  useEffect(() => {
    ref.current?.removeAttribute("open");
  }, [pathname, ref]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.removeAttribute("open");
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref]);
}

export function AppShell({ nav, newActions, user, tenant, tenants, switchTenant, signOut, locale, labels, children }: Props) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const mobile = nav.flatMap((g) => g.items).filter((i) => i.mobile).slice(0, 4);
  const newRef = useRef<HTMLDetailsElement>(null);
  const userRef = useRef<HTMLDetailsElement>(null);
  useAutoClose(newRef, pathname);
  useAutoClose(userRef, pathname);

  return (
    <div className="min-h-dvh bg-canvas">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e border-line bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <LogoMark className="size-7" />
          <TenantSwitcher tenant={tenant} tenants={tenants} switchTenant={switchTenant} />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          {nav.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1 px-2 text-[11.5px] font-medium text-faint">{group.label}</p>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                    className={cn("relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
                      active ? "bg-subtle text-ink" : "text-muted hover:bg-subtle/70 hover:text-ink")}>
                    {active && <span className="absolute -start-3 top-1.5 h-5 w-[3px] rounded-e bg-brand-500" aria-hidden />}
                    <Icon className={cn("size-4", active ? "text-navy-900" : "text-faint")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {tenant.hasSampleData && (
          <div className="mx-3 mb-3 rounded-lg border border-warning-600/20 bg-warning-50 px-3 py-2 text-xs text-warning-600">
            {labels.sampleLoaded} <Link href="/app/settings/sample-data" className="font-semibold underline underline-offset-2">{labels.manage}</Link>
          </div>
        )}
      </aside>

      <div className="lg:ps-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <Link href="/app/dashboard" className="flex min-w-0 shrink items-center gap-2 lg:hidden" aria-label="Dashboard">
            <LogoMark className="size-7 shrink-0" />
            <span className="truncate text-[14px] font-semibold sm:hidden">{tenant.name}</span>
          </Link>
          <Link href="/app/search" aria-label={labels.search} className="ms-auto grid size-9 shrink-0 place-items-center rounded-lg border border-line text-muted sm:hidden">
            <Search className="size-4" />
          </Link>
          <form action="/app/search" method="get" role="search" className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <label htmlFor="global-search" className="sr-only">Search orders and customers</label>
            <input id="global-search" name="q" placeholder={labels.search}
              className="h-9 w-full rounded-lg border border-line bg-canvas ps-8 pe-3 text-[13px] placeholder:text-faint focus:border-navy-700 focus:bg-surface focus:outline-none" />
          </form>
          <div className="flex shrink-0 items-center gap-2 sm:ms-auto">
            <LanguageSwitcher locale={locale} label={labels.language} className="hidden md:inline-flex" />
            {newActions.length > 0 && (
              <details ref={newRef} className="relative">
                <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-[13px] font-semibold text-white hover:bg-navy-800 [&::-webkit-details-marker]:hidden">
                  <Plus className="size-4" /><span className="hidden sm:inline">{labels.new}</span>
                </summary>
                <div className="absolute end-0 mt-1.5 w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-[0_8px_24px_rgb(11_27_51/0.12)]">
                  {newActions.map((a) => (
                    <Link key={a.href} href={a.href} className="block px-3 py-2 text-[13px] hover:bg-subtle">{a.label}</Link>
                  ))}
                </div>
              </details>
            )}
            <details ref={userRef} className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1 hover:bg-subtle [&::-webkit-details-marker]:hidden">
                <Avatar name={user.fullName ?? user.email} />
                <ChevronDown className="hidden size-3.5 text-faint sm:block" />
              </summary>
              <div className="absolute end-0 mt-1.5 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-[0_8px_24px_rgb(11_27_51/0.12)]">
                <div className="border-b border-line px-3 py-2.5">
                  <p className="truncate text-[13px] font-semibold">{user.fullName ?? "Your account"}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                  <p className="mt-1 text-xs text-muted">{tenant.roleName} at {tenant.name}</p>
                </div>
                {tenants.length > 1 && (
                  <form action={switchTenant} className="border-b border-line p-2">
                    <p className="px-1 pb-1 text-xs text-faint">{labels.switchBusiness}</p>
                    {tenants.map((t) => (
                      <button key={t.id} name="tenantId" value={t.id} type="submit"
                        className={cn("block w-full rounded-md px-2 py-1.5 text-start text-[13px] hover:bg-subtle", t.id === tenant.id && "font-semibold")}>
                        {t.name}
                      </button>
                    ))}
                  </form>
                )}
                <form action={signOut} className="p-1">
                  <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-subtle hover:text-ink">
                    <LogOut className="size-4" />{labels.signOut}
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>

        {tenant.isDemo && (
          <div className="border-b border-warning-600/15 bg-warning-50 px-6 py-1.5 text-xs text-warning-600">
            Demo business. Its data is sample data and is kept separate from live businesses.
          </div>
        )}
        <main className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        {mobile.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-ink" : "text-faint")}>
              <Icon className={cn("size-5", active && "text-navy-900")} />{item.label}
            </Link>
          );
        })}
        <Link href="/app/more" className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive("/app/more") ? "text-ink" : "text-faint")}>
          <Menu className="size-5" />{labels.more}
        </Link>
      </nav>
    </div>
  );
}

function TenantSwitcher({ tenant }: Pick<Props, "tenant" | "tenants" | "switchTenant">) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-semibold leading-tight">{tenant.name}</p>
      <p className="truncate text-[11.5px] leading-tight text-faint">{tenant.roleName}</p>
    </div>
  );
}
