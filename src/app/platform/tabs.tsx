"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Building2, CreditCard, Handshake, LifeBuoy, Megaphone, Palette, Receipt, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { Building2, Bot, Palette, Receipt, CreditCard, Megaphone, LifeBuoy, Handshake, ShieldCheck, Users };

export function PlatformTabs({ tabs }: { tabs: { href: string; label: string; icon: string; badge?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Platform sections">
      {tabs.map((t) => {
        const Icon = ICONS[t.icon];
        const on = pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
            className={cn("flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[13px] font-medium",
              on ? "border-teal-500 text-teal-600" : "border-transparent text-muted hover:text-ink")}>
            <Icon className="size-4" />{t.label}
            {t.badge ? <span className="rounded bg-warning-50 px-1.5 text-[11px] font-semibold text-warning-600 tnum">{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
