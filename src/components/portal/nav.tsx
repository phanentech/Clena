"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUser, ClipboardList, House, Plus, TicketPercent } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./cart";

export function PortalBottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/b/${slug}`;
  const { count } = useCart();
  const items = [
    { href: base, label: "Home", icon: House, exact: true },
    { href: `${base}/orders`, label: "Orders", icon: ClipboardList },
    null,
    { href: `${base}/offers`, label: "Offers", icon: TicketPercent },
    { href: `${base}/profile`, label: "Profile", icon: CircleUser },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6EAF1] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
        {items.map((it) => {
          if (!it) {
            return (
              <Link key="new" href={`${base}/services`} aria-label="New order"
                className="relative mx-auto -mt-8 grid size-14 place-items-center rounded-full text-[var(--p-on-primary)] ring-4 ring-white [background:linear-gradient(135deg,var(--p-primary),var(--p-secondary))]">
                <Plus className="size-6" />
                {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-[var(--p-accent)] text-[10px] font-bold text-[var(--p-on-accent)]">{count}</span>}
              </Link>
            );
          }
          const on = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
              className={cn("flex flex-col items-center gap-0.5 text-[11px] font-medium", on ? "text-[var(--p-primary)]" : "text-[#8A96A8]")}>
              <Icon className="size-[22px]" strokeWidth={on ? 2.2 : 1.7} />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function PortalTopLinks({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/b/${slug}`;
  const links = [
    { href: base, label: "Home", exact: true },
    { href: `${base}/services`, label: "Services" },
    { href: `${base}/orders`, label: "Orders" },
    { href: `${base}/offers`, label: "Offers" },
    { href: `${base}/support`, label: "Support" },
    { href: `${base}/profile`, label: "Profile" },
  ];
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {links.map((l) => {
        const on = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors",
              on ? "bg-white/18 text-white" : "text-white/75 hover:text-white")}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
