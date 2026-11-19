import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader, StageBadge, Table, Td, Th } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { PAYMENT_LABEL, PAYMENT_TONE, type PaymentStatus } from "@/lib/orders";
import { PaymentForm, StageForm } from "./forms";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { membership } = await requireTenant("orders.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*, customers(id, full_name, phone, email), branches(name)")
    .eq("id", id)
    .eq("tenant_id", membership.tenantId)
    .maybeSingle();
  if (!order) notFound();

  const money = can(membership, "payments.view");
  const [{ data: items }, { data: stages }, { data: history }, { data: payments }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id).order("created_at"),
    supabase.from("workflow_stages").select("id, name, color, position, is_terminal, allowed_roles").eq("workflow_id", order.workflow_id).order("position"),
    supabase.from("order_status_history").select("id, from_stage_id, to_stage_id, note, created_at, changed_by").eq("order_id", id).order("created_at", { ascending: false }),
    money ? supabase.from("payments").select("id, amount, method, status, reference, created_at, note").eq("order_id", id).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as never[] }),
  ]);
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
  const current = stageById.get(order.current_stage_id);
  const customer = order.customers as unknown as { id: string; full_name: string; phone: string | null; email: string | null };
  const canMove = can(membership, "orders.update_status") || can(membership, "orders.manage");
  const movable = (stages ?? []).filter((s) => s.allowed_roles.length === 0 || s.allowed_roles.includes(membership.roleKey));
  const balance = Number(order.total) - Number(order.amount_paid);

  return (
    <>
      <PageHeader back={{ href: "/app/orders", label: "Orders" }} title={`Order ${order.order_number}`}
        description={`${(order.branches as unknown as { name: string } | null)?.name ?? ""} · Created ${formatDateTime(order.created_at)}`}
        actions={<div className="flex items-center gap-2">{order.is_demo && <Badge tone="warning">sample</Badge>}{current && <StageBadge name={current.name} color={current.color} />}
          {money && <Badge tone={PAYMENT_TONE[order.payment_status as PaymentStatus]}>{PAYMENT_LABEL[order.payment_status as PaymentStatus]}</Badge>}</div>} />

      {/* Progress through the configured workflow */}
      <Card className="mb-6 overflow-x-auto p-5">
        <ol className="flex min-w-max items-center gap-2">
          {stages?.map((s, i) => {
            const reached = current ? s.position <= current.position : false;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <span className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium ${s.id === current?.id ? "bg-navy-900 text-white" : reached ? "bg-brand-50 text-brand-700" : "bg-canvas text-muted"}`}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}
                </span>
                {i < stages.length - 1 && <span className={`h-px w-5 ${reached ? "bg-brand-500" : "bg-line"}`} />}
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Items" />
            <Table>
              <thead><tr><Th>Service</Th><Th className="text-right">Qty</Th>{money && <><Th className="text-right">Price</Th><Th className="text-right">Total</Th></>}</tr></thead>
              <tbody>
                {items?.map((it) => (
                  <tr key={it.id}>
                    <Td className="font-medium">{it.description}</Td>
                    <Td className="text-right">{Number(it.quantity)}</Td>
                    {money && <><Td className="text-right text-muted">{formatMoney(it.unit_price, order.currency)}</Td><Td className="text-right font-medium">{formatMoney(it.line_total, order.currency)}</Td></>}
                  </tr>
                ))}
              </tbody>
            </Table>
            {money && (
              <dl className="ml-auto grid max-w-xs gap-1 px-5 py-4 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(order.subtotal, order.currency)}</dd></div>
                {Number(order.discount_total) > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd>−{formatMoney(order.discount_total, order.currency)}</dd></div>}
                {Number(order.tax_total) > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{formatMoney(order.tax_total, order.currency)}</dd></div>}
                {Number(order.service_fee) > 0 && <div className="flex justify-between"><dt className="text-muted">Service charge</dt><dd>{formatMoney(order.service_fee, order.currency)}</dd></div>}
                {Number(order.delivery_fee) > 0 && <div className="flex justify-between"><dt className="text-muted">Collection & delivery</dt><dd>{formatMoney(order.delivery_fee, order.currency)}</dd></div>}
                {order.promo_code && <div className="flex justify-between"><dt className="text-muted">Promo code</dt><dd className="tnum">{order.promo_code}</dd></div>}
                <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Total</dt><dd>{formatMoney(order.total, order.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{formatMoney(order.amount_paid, order.currency)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Balance</dt><dd>{formatMoney(balance, order.currency)}</dd></div>
              </dl>
            )}
          </Card>

          {money && (
            <Card>
              <CardHeader title="Payments" description="Online payments appear after the provider confirms them." />
              {payments && payments.length > 0 ? (
                <ul className="divide-y divide-line">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <div><p className="font-medium capitalize">{String(p.method).replace("_", " ")}</p><p className="text-xs text-muted">{p.reference} · {formatDateTime(p.created_at)}</p></div>
                      <div className="text-right"><p className="font-semibold">{formatMoney(p.amount, order.currency)}</p><Badge tone={p.status === "successful" ? "success" : p.status === "failed" ? "danger" : "warning"}>{p.status}</Badge></div>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-5 py-6 text-sm text-muted">No payments recorded yet.</p>}
              {can(membership, "payments.record") && balance > 0 && (
                <div className="border-t border-line p-5"><PaymentForm orderId={order.id} balance={balance} currency={order.currency} /></div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Status history" description="Every change is recorded." />
            <ol className="divide-y divide-line">
              {history?.map((h) => {
                const to = stageById.get(h.to_stage_id);
                return (
                  <li key={h.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: to?.color ?? "#64748B" }} />
                    <div>
                      <p className="font-medium">{h.from_stage_id ? `Moved to ${to?.name ?? "stage"}` : `Created in ${to?.name ?? "first stage"}`}</p>
                      {h.note && <p className="text-muted">{h.note}</p>}
                      <p className="text-xs text-muted">{formatDateTime(h.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {canMove && current && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Update status</h2>
              <StageForm orderId={order.id} stages={movable.map((s) => ({ id: s.id, name: s.name }))} currentId={current.id} />
            </Card>
          )}
          <Card className="p-5 text-sm">
            <h2 className="mb-3 font-semibold">Customer</h2>
            {can(membership, "customers.view") ? (
              <Link href={`/app/customers/${customer.id}`} className="font-medium text-teal-600 hover:underline">{customer.full_name}</Link>
            ) : <p className="font-medium">{customer.full_name}</p>}
            {customer.phone && <p className="mt-1 text-muted">{customer.phone}</p>}
            {customer.email && <p className="text-muted">{customer.email}</p>}
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="mb-3 font-semibold">Details</h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-muted">Expected</dt><dd>{formatDateTime(order.expected_at)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Completed</dt><dd>{formatDateTime(order.completed_at)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Source</dt><dd>{order.source === "portal" ? "Customer app" : <span className="capitalize">{order.source}</span>}</dd></div>
              {order.pickup_at && <div className="flex justify-between gap-3"><dt className="text-muted">{order.pickup_required ? "Collection" : "Drop-off"}</dt><dd>{formatDateTime(order.pickup_at)}</dd></div>}
              {order.cancelled_at && <div className="flex justify-between gap-3"><dt className="text-muted">Cancelled</dt><dd>{formatDateTime(order.cancelled_at)}</dd></div>}
            </dl>
            {(order.pickup_address || order.delivery_address) && (
              <div className="mt-4 grid gap-2 rounded-xl bg-canvas p-3">
                {order.pickup_address && <p><span className="block text-xs text-muted">Collect from</span>{order.pickup_address}</p>}
                {order.delivery_address && <p><span className="block text-xs text-muted">Deliver to</span>{order.delivery_address}</p>}
              </div>
            )}
            {order.cancel_reason && <p className="mt-3 text-xs text-danger-600">Cancelled: {order.cancel_reason}</p>}
            {order.notes && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-canvas p-3">{order.notes}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
