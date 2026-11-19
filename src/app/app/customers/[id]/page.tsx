import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Mail, MapPin, Phone, Plus } from "lucide-react";
import { Avatar, Badge, Card, CardHeader, OrderTag, PageHeader, StageBadge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { NoteForm } from "./note-form";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { membership } = await requireTenant("customers.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*, customer_addresses(*)")
    .eq("id", id)
    .eq("tenant_id", membership.tenantId)
    .maybeSingle();
  if (!customer) notFound();

  const canOrders = can(membership, "orders.view");
  const [{ data: orders }, { data: notes }, { data: tenant }] = await Promise.all([
    canOrders
      ? supabase.from("orders").select("id, order_number, total, payment_status, created_at, completed_at, workflow_stages!orders_tenant_id_current_stage_id_fkey(name, color)")
          .eq("customer_id", id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("customer_notes").select("id, body, created_at, author_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("tenants").select("currency").eq("id", membership.tenantId).single(),
  ]);
  const currency = tenant?.currency ?? "NGN";
  const lifetime = (orders ?? []).reduce((s, o) => s + Number(o.total), 0);
  const lastOrder = orders?.[0]?.created_at;

  const timeline = [
    ...(orders ?? []).map((o) => ({ at: o.created_at, kind: "order" as const, o })),
    ...(notes ?? []).map((n) => ({ at: n.created_at, kind: "note" as const, n })),
    { at: customer.created_at, kind: "created" as const },
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <>
      <PageHeader title={customer.full_name} description={customer.company_name ?? `Customer since ${formatDate(customer.created_at)}`}
        back={{ href: "/app/customers", label: "Customers" }}
        actions={can(membership, "orders.manage") && <Button asChild><Link href={`/app/orders/new?customer=${customer.id}`}><Plus />New order</Link></Button>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={customer.full_name} className="size-12 text-sm" />
              <div className="flex flex-wrap gap-1">
                {customer.is_demo && <Badge tone="warning">sample</Badge>}
                <Badge tone="info">{customer.customer_type}</Badge>
                {(customer.tags as string[]).map((t) => <Badge key={t}>{t}</Badge>)}
              </div>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              {customer.phone && <div className="flex items-center gap-2"><Phone className="size-4 text-muted" /><a href={`tel:${customer.phone}`} className="hover:text-teal-600">{customer.phone}</a></div>}
              {customer.email && <div className="flex items-center gap-2"><Mail className="size-4 text-muted" /><a href={`mailto:${customer.email}`} className="hover:text-teal-600">{customer.email}</a></div>}
              {(customer.customer_addresses as { id: string; line1: string; city: string | null }[]).map((a) => (
                <div key={a.id} className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-muted" />{a.line1}{a.city ? `, ${a.city}` : ""}</div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap gap-1.5 text-xs">
              <Badge tone={customer.whatsapp_opt_in ? "success" : "neutral"}>WhatsApp {customer.whatsapp_opt_in ? "on" : "off"}</Badge>
              <Badge tone={customer.marketing_opt_in ? "success" : "neutral"}>Promotions {customer.marketing_opt_in ? "on" : "off"}</Badge>
            </div>
          </Card>
          <Card className="grid grid-cols-2 divide-x divide-line">
            <div className="p-5"><p className="text-xs text-muted">Orders</p><p className="mt-1 text-xl font-bold">{orders?.length ?? 0}</p></div>
            <div className="p-5"><p className="text-xs text-muted">Lifetime value</p><p className="mt-1 text-xl font-bold">{canOrders ? formatMoney(lifetime, currency) : "—"}</p></div>
            <div className="col-span-2 border-t border-line p-5"><p className="text-xs text-muted">Last order</p><p className="mt-1 text-sm font-semibold">{formatDate(lastOrder)}</p></div>
          </Card>
          {customer.notes && <Card className="p-5"><p className="text-xs font-medium text-muted">Profile notes</p><p className="mt-2 whitespace-pre-wrap text-sm">{customer.notes}</p></Card>}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title="Activity" description="Orders and notes, newest first" />
          {can(membership, "customers.manage") && <div className="border-b border-line p-5"><NoteForm customerId={customer.id} /></div>}
          <ol className="divide-y divide-line">
            {timeline.map((item, i) => (
              <li key={i} className="flex gap-4 px-5 py-4 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-teal-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  {item.kind === "order" && (() => {
                    const stage = item.o.workflow_stages as unknown as { name: string; color: string } | null;
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <OrderTag number={item.o.order_number} href={`/app/orders/${item.o.id}`} />
                        <div className="flex items-center gap-2">
                          {stage && <StageBadge name={stage.name} color={stage.color} />}
                          <span className="font-medium">{formatMoney(item.o.total, currency)}</span>
                        </div>
                      </div>
                    );
                  })()}
                  {item.kind === "note" && <p className="whitespace-pre-wrap">{item.n.body}</p>}
                  {item.kind === "created" && <p className="text-muted">Customer added</p>}
                  <p className="mt-1 text-xs text-muted">{formatDateTime(item.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
