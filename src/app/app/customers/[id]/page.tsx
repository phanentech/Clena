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
import { hasLaundryOps } from "@/lib/ops";
import { SEGMENT_LABEL } from "@/lib/ops-shared";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/primitives";
import { adjustPoints } from "../../ops-actions";

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
  const laundry = await hasLaundryOps(membership.tenantId);
  const [{ data: ins }, { data: subs }, { data: fb }] = laundry ? await Promise.all([
    supabase.rpc("customer_insights", { p_tenant: membership.tenantId, p_customer: id }),
    supabase.from("customer_subscriptions").select("status, current_period_end, subscription_plans(name)").eq("customer_id", id).in("status", ["active", "pending_payment"]).limit(1),
    supabase.from("order_feedback").select("rating").eq("customer_id", id),
  ]) : [{ data: null }, { data: null }, { data: null }];
  const insight = (ins as { segment: string; reason: string; predicted_next_at: string | null; avg_interval_days: number | null; avg_order_value: number | null; preferred_dow: number | null }[] | null)?.[0];
  const sub = subs?.[0];
  const avgRating = fb?.length ? (fb.reduce((a, f) => a + f.rating, 0) / fb.length).toFixed(1) : null;
  const prefs = Object.entries((customer.preferences ?? {}) as Record<string, unknown>).filter(([k, v]) => v && k !== "payment_method");
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
          {laundry && (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Customer insight</p>
                {insight && <Badge tone={insight.segment === "at_risk" || insight.segment === "lapsed" ? "warning" : insight.segment === "vip" ? "success" : "info"}>{SEGMENT_LABEL[insight.segment] ?? insight.segment}</Badge>}
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                {insight?.reason && <p className="text-muted">{insight.reason}</p>}
                {insight?.avg_interval_days && <div className="flex justify-between"><dt className="text-muted">Orders every</dt><dd>{Math.round(Number(insight.avg_interval_days))} days</dd></div>}
                {insight?.predicted_next_at && <div className="flex justify-between"><dt className="text-muted">Next expected</dt><dd>{formatDate(insight.predicted_next_at)}</dd></div>}
                {insight?.preferred_dow !== null && insight?.preferred_dow !== undefined && <div className="flex justify-between"><dt className="text-muted">Usual day</dt><dd>{DOW[insight.preferred_dow]}</dd></div>}
                {insight?.avg_order_value && <div className="flex justify-between"><dt className="text-muted">Average order</dt><dd>{formatMoney(Number(insight.avg_order_value), currency)}</dd></div>}
                <div className="flex justify-between"><dt className="text-muted">Points</dt><dd className="tnum">{customer.loyalty_points ?? 0}</dd></div>
                {customer.referral_code && <div className="flex justify-between"><dt className="text-muted">Referral code</dt><dd className="font-medium tnum">{customer.referral_code}</dd></div>}
                {avgRating && <div className="flex justify-between"><dt className="text-muted">Average rating</dt><dd>{avgRating} / 5 ({fb!.length})</dd></div>}
                {sub && <div className="flex justify-between"><dt className="text-muted">Plan</dt><dd>{(sub.subscription_plans as unknown as { name: string } | null)?.name} · {sub.status === "active" ? `to ${formatDate(sub.current_period_end)}` : "awaiting payment"}</dd></div>}
              </dl>
              {prefs.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{prefs.map(([k, v]) => <Badge key={k}>{k.replaceAll("_", " ")}: {String(v)}</Badge>)}</div>}
              {can(membership, "marketing.manage") && (
                <ActionForm action={adjustPoints.bind(null, id)} compact className="mt-4 flex gap-2" resetOnSuccess>
                  <Input name="points" type="number" placeholder="± points" aria-label="Points" className="h-9 w-24" />
                  <Input name="note" placeholder="Reason" aria-label="Reason" className="h-9 flex-1" />
                  <SubmitButton size="sm" variant="outline">Apply</SubmitButton>
                </ActionForm>
              )}
            </Card>
          )}
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
