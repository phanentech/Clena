"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ClipboardList, LayoutList, ListChecks, MapPinned, ScanLine, Truck, UserCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { LayoutList, ScanLine, UserCheck, AlertTriangle, Truck, MapPinned, ListChecks, ClipboardList };

export type OpsNavItem = { href: string; label: string; icon: string; badge?: number; exact?: boolean };

export function OpsBottomNav({ items }: { items: OpsNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid h-16 max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const on = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`);
          const Icon = ICONS[it.icon] ?? LayoutList;
          return (
            <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
              className={cn("relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium", on ? "text-navy-900" : "text-faint")}>
              <span className="relative">
                <Icon className="size-[22px]" strokeWidth={on ? 2.2 : 1.7} />
                {it.badge ? <span className="absolute -end-2.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white">{it.badge}</span> : null}
              </span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
