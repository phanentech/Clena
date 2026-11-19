import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { Avatar, Card, CardHeader, EmptyState, OrderTag, PageHeader } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { membership } = await requireTenant();
  const { q = "" } = await searchParams;
  const term = q.trim().replace(/[%,()*]/g, "").slice(0, 60);
  const supabase = await createClient();

  const [customers, orders] = term.length >= 2 ? await Promise.all([
    can(membership, "customers.view")
      ? supabase.from("customers").select("id, full_name, phone, email").eq("tenant_id", membership.tenantId)
          .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`).limit(10)
      : Promise.resolve({ data: [] }),
    can(membership, "orders.view")
      ? supabase.from("orders").select("id, order_number, total, currency, created_at, customers(full_name)").eq("tenant_id", membership.tenantId)
          .ilike("order_number", `%${term}%`).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }];
  const cs = (customers.data ?? []) as { id: string; full_name: string; phone: string | null; email: string | null }[];
  const os = (orders.data ?? []) as unknown as { id: string; order_number: string; total: number; currency: string; created_at: string; customers: { full_name: string } | null }[];

  return (
    <>
      <PageHeader title={term ? `Results for "${term}"` : "Search"} description="Search customers by name, phone or email, and orders by number." />
      {term.length < 2 ? (
        <Card><EmptyState icon={<Search />} title="Type at least two characters" description="Use the search box at the top of any page." /></Card>
      ) : !cs.length && !os.length ? (
        <Card><EmptyState icon={<Search />} title="Nothing matches" description="Check the spelling, or search a phone number without the country code." /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Customers" description={`${cs.length} found`} />
            <ul className="divide-y divide-line">
              {cs.map((c) => (
                <li key={c.id}><Link href={`/app/customers/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle"><Avatar name={c.full_name} /><div><p className="text-[13px] font-medium">{c.full_name}</p><p className="text-xs text-muted">{c.phone ?? c.email}</p></div></Link></li>
              ))}
              {!cs.length && <li className="px-4 py-6 text-center text-[13px] text-muted">No customers.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Orders" description={`${os.length} found`} />
            <ul className="divide-y divide-line">
              {os.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                  <OrderTag number={o.order_number} href={`/app/orders/${o.id}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{o.customers?.full_name}</p><p className="text-xs text-muted">{formatDateTime(o.created_at)}</p></div>
                  {can(membership, "payments.view") && <span className="text-[13px] font-medium tnum">{formatMoney(o.total, o.currency)}</span>}
                </li>
              ))}
              {!os.length && <li className="px-4 py-6 text-center text-[13px] text-muted">No orders.</li>}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
