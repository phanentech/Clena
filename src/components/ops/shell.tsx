import Link from "next/link";
import { ChevronLeft, LogOut } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { signOut } from "@/app/auth/actions";
import { OpsBottomNav, type OpsNavItem } from "./ops-nav";

/** Mobile-first frame for the operations and driver apps: compact top bar, bottom tabs. */
export function OpsShell({ business, role, nav, children, back, title, actions }: {
  business: string; role: string; nav: OpsNavItem[]; children: React.ReactNode; back?: string; title?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
          {back ? (
            <Link href={back} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-subtle"><ChevronLeft className="size-5" /></Link>
          ) : (
            <LogoMark className="ms-1 size-7 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold leading-tight">{title ?? business}</p>
            <p className="truncate text-[11.5px] leading-tight text-faint">{title ? business : role}</p>
          </div>
          {actions}
          <form action={signOut}>
            <button type="submit" aria-label="Sign out" className="grid size-10 place-items-center rounded-lg text-muted hover:bg-subtle"><LogOut className="size-[18px]" /></button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-3 pb-28 pt-4">{children}</main>
      <OpsBottomNav items={nav} />
    </div>
  );
}

export function staffNav(counts: { exceptions?: number; mine?: number }): OpsNavItem[] {
  return [
    { href: "/staff", label: "Queues", icon: "LayoutList", exact: true },
    { href: "/staff/scan", label: "Scan", icon: "ScanLine" },
    { href: "/staff/tasks", label: "My tasks", icon: "UserCheck", badge: counts.mine || undefined },
    { href: "/staff/exceptions", label: "Exceptions", icon: "AlertTriangle", badge: counts.exceptions || undefined },
  ];
}
