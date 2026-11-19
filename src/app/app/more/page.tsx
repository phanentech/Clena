import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { APP_NAV } from "@/components/app/nav";
import { requireTenant } from "@/lib/auth/session";

export const metadata: Metadata = { title: "More" };

/** Mobile menu: every area the signed-in role can open. */
export default async function MorePage() {
  const { membership } = await requireTenant();
  return (
    <>
      <PageHeader title="Menu" description={membership.tenantName} />
      <div className="grid gap-4">
        {APP_NAV.map((g) => {
          const items = g.items.filter((i) => membership.permissions.includes(i.permission));
          if (!items.length) return null;
          return (
            <Card key={g.label}>
              <p className="border-b border-line px-4 py-2 text-xs font-medium text-faint">{g.label}</p>
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <li key={i.href}><Link href={i.href} className="flex items-center justify-between px-4 py-3 text-sm font-medium">{i.label}<ChevronRight className="size-4 text-faint" /></Link></li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
