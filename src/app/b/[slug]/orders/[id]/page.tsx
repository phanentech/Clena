import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, KeyRound, Landmark, MessageCircle, Phone, Receipt, Scale } from "lucide-react";
import { CancelOrder } from "@/components/portal/cancel-order";
import { FeedbackForm, PendingAdjustments, ReportIssue } from "@/components/portal/order-extras";
import { Chip, PCard, PortalScreen, StageTrack } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { getMyOrders, itemSummary } from "@/lib/portal-orders";
import { createClient } from "@/lib/supabase/server";
import { cn, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Order details" };

export default async function OrderDetailsPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { slug, id } = await params;
  const { placed } = await searchParams;
  const { business } = await requireCustomer(slug);
  const [order] = await getMyOrders(business.id, { ids: [id] });
  if (!order) notFound();
  const supabase = await createClient();
  const [{ data: d }, { data: hist }, { data: pays }, { data: t }] = await Promise.all([
    supabase.from("orders").select("pickup_address, delivery_address, pickup_at, expected_at, subtotal, tax_total, delivery_fee, service_fee, express_fee, adjustments_total, is_express, points_redeemed, received_item_count, received_weight_kg, on_hold, discount_total, promo_code, notes, cancel_reason, order_items(description, quantity, unit_price, line_total, pricing_model)").eq("id", id).single(),
    supabase.from("order_status_history").select("to_stage_id, created_at").eq("order_id", id).order("created_at"),
    supabase.from("payments").select("amount, method, created_at, status").eq("order_id", id).eq("status", "successful").order("created_at"),
    supabase.from("tenants").select("settings").eq("id", business.id).single(),
  ]);
  if (!d) notFound();
  const laundry = Boolean(business.laundry_ops);
  const [{ data: adjs }, { data: media }, { data: fb }, { data: otp }, { data: refunds }] = laundry ? await Promise.all([
    supabase.from("order_adjustments").select("id, kind, amount, reason, status").eq("order_id", id).order("created_at"),
    supabase.from("ops_media").select("id, kind, data_url, caption").eq("order_id", id).in("kind", ["customer_photo", "proof_photo", "photo"]).order("created_at").limit(12),
    supabase.from("order_feedback").select("rating, comment").eq("order_id", id).maybeSingle(),
    supabase.rpc("my_delivery_otp", { p_order: id }),
    supabase.from("refunds").select("amount, created_at").eq("order_id", id),
  ]) : [{ data: [] }, { data: [] }, { data: null }, { data: null }, { data: [] }];
  const tz = business.timezone;
  const when = (v: string | null) => v ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(v)) : null;
  const reachedAt = new Map((hist ?? []).map((h) => [h.to_stage_id, h.created_at]));
  const money = (n: number | string) => formatMoney(Number(n), order.currency);
  const bank = ((t?.settings as Record<string, Record<string, string>> | null)?.payments) ?? {};
  const balance = order.total - order.amount_paid;
  const canCancel = !order.cancelled_at && order.stageIndex === 0 && order.amount_paid === 0;
  const p = business.portal;
  const pendingAdj = (adjs ?? []).filter((a) => a.status === "pending_approval").map((a) => ({ ...a, amount: Number(a.amount), label: `${Number(a.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(a.amount)))}` }));
  const appliedAdj = (adjs ?? []).filter((a) => a.status === "applied");
  const doneStage = order.done && !order.cancelled_at;

  return (
    <PortalScreen business={business} title="Order details" back={`/b/${slug}/orders`} wide>
      {placed && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-[var(--p-radius)] bg-[color-mix(in_srgb,var(--p-accent)_14%,white)] p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--p-accent)]" />
          <div><p className="text-[14px] font-semibold">Order placed</p><p className="text-[12.5px] text-[#4A5A70]">{business.name} has your order {order.order_number}. You&apos;ll see each step here.</p></div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="grid gap-4">
          {laundry && <PendingAdjustments slug={slug} items={pendingAdj} />}
          {laundry && otp && (
            <PCard className="flex items-center gap-4 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--p-accent)_16%,white)] text-[var(--p-accent)]"><KeyRound className="size-5" /></span>
              <div className="min-w-0 flex-1"><p className="text-[13.5px] font-semibold">Delivery code</p><p className="text-[12px] text-[#6B7A90]">Give this to the rider only when you receive your order.</p></div>
              <span className="text-[26px] font-semibold tracking-[0.2em] tabular-nums">{otp as string}</span>
            </PCard>
          )}
          <PCard className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[16px] font-semibold">
                {order.cancelled_at ? "This order was cancelled" : order.done ? `Your order is ${order.stageName.toLowerCase()}` : `Your order is ${order.stageName.toLowerCase()}`}
              </p>
              {order.cancelled_at ? <Chip tone="danger">Cancelled</Chip> : <Chip tone={order.done ? "neutral" : "accent"}>{order.done ? "Completed" : "In progress"}</Chip>}
            </div>
            <p className="mt-1 text-[12.5px] text-[#6B7A90]">{order.order_number} · {itemSummary(order.items)}{d.expected_at && !order.done ? ` · Due ${when(d.expected_at)}` : ""}</p>
            <StageTrack stages={order.stages} currentIndex={order.stageIndex} cancelled={Boolean(order.cancelled_at)} />
            {d.on_hold && !order.cancelled_at && <p className="mt-3 rounded-[calc(var(--p-radius)*0.5)] bg-[#FFF4E5] p-2.5 text-[12.5px] text-[#9A5B00]">We&apos;re checking something on this order and will update you shortly.</p>}
            {order.cancelled_at && d.cancel_reason && <p className="mt-3 text-[12.5px] text-[#6B7A90]">Reason: {d.cancel_reason}</p>}

            <ol className="mt-5 grid gap-0">
              {order.stages.map((s, i) => {
                const doneStep = i <= order.stageIndex && !order.cancelled_at;
                const at = reachedAt.get(s.id);
                return (
                  <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < order.stages.length - 1 && <span aria-hidden className={cn("absolute left-[7px] top-4 h-full w-0.5", i < order.stageIndex && !order.cancelled_at ? "bg-[var(--p-accent)]" : "bg-[#E6EAF1]")} />}
                    <span aria-hidden className={cn("relative mt-0.5 size-4 shrink-0 rounded-full border-2", doneStep ? "border-[var(--p-accent)] bg-[var(--p-accent)]" : "border-[#D3DAE5] bg-white", i === order.stageIndex && !order.done && "ring-4 ring-[color-mix(in_srgb,var(--p-accent)_22%,transparent)]")} />
                    <div className="flex min-w-0 flex-1 justify-between gap-3 text-[13px]">
                      <span className={doneStep ? "font-medium" : "text-[#9AA5B5]"}>{s.name}</span>
                      {at && doneStep && <span className="shrink-0 text-[12px] text-[#8A96A8]">{when(at)}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </PCard>

          {(d.pickup_address || d.delivery_address) ? (
            <PCard className="p-4">
              <div className="relative grid gap-4 pl-6">
                <span aria-hidden className="absolute left-[7px] top-2 h-[calc(100%-1.25rem)] w-0.5 [background:linear-gradient(var(--p-secondary),var(--p-accent))]" />
                <div className="relative">
                  <span aria-hidden className="absolute -left-6 top-1 size-4 rounded-full border-[3px] border-[var(--p-secondary)] bg-white" />
                  <p className="text-[13.5px] font-semibold">Pick-up point{d.pickup_at ? ` · ${when(d.pickup_at)}` : ""}</p>
                  <p className="text-[12.5px] text-[#6B7A90]">{d.pickup_address}</p>
                </div>
                <div className="relative">
                  <span aria-hidden className="absolute -left-6 top-1 size-4 rounded-full border-[3px] border-[var(--p-accent)] bg-white" />
                  <p className="text-[13.5px] font-semibold">Delivery point{d.expected_at ? ` · ${when(d.expected_at)}` : ""}</p>
                  <p className="text-[12.5px] text-[#6B7A90]">{d.delivery_address}</p>
                </div>
              </div>
            </PCard>
          ) : (
            <PCard className="p-4">
              <p className="text-[13.5px] font-semibold">Drop-off at {business.name}</p>
              <p className="text-[12.5px] text-[#6B7A90]">{business.address ?? "Bring your items to our shop."}{d.pickup_at ? ` Drop-off: ${when(d.pickup_at)}.` : ""}</p>
            </PCard>
          )}

          <PCard className="divide-y divide-[#EEF1F5]">
            {(d.order_items ?? []).map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-[13.5px]">
                <span className="min-w-0"><span className="block truncate font-medium">{it.description}</span><span className="text-[12px] text-[#8A96A8]">{Number(it.quantity)} × {money(it.unit_price)}</span></span>
                <span className="shrink-0 font-medium tabular-nums">{money(it.line_total)}</span>
              </div>
            ))}
            {d.notes && <p className="px-4 py-3 text-[12.5px] text-[#6B7A90]">Your note: {d.notes}</p>}
            {(d.received_weight_kg || d.received_item_count) && (
              <p className="flex items-center gap-2 px-4 py-3 text-[12.5px] text-[#4A5A70]"><Scale className="size-4" />Confirmed at our facility: {[d.received_item_count && `${d.received_item_count} items`, d.received_weight_kg && `${Number(d.received_weight_kg)} kg`].filter(Boolean).join(" · ")}</p>
            )}
          </PCard>

          {(media ?? []).length > 0 && (
            <PCard className="p-4">
              <p className="text-[14px] font-semibold">Photos</p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(media ?? []).map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element -- stored data URL
                  <img key={m.id} src={m.data_url} alt={m.caption ?? (m.kind === "proof_photo" ? "Delivery proof" : "Order photo")} className="aspect-square w-full rounded-[10px] object-cover" />
                ))}
              </div>
            </PCard>
          )}

          {laundry && doneStage && <FeedbackForm slug={slug} orderId={order.id} existing={fb ? { rating: fb.rating, comment: fb.comment } : null} />}
        </div>

        <div className="grid gap-4 lg:sticky lg:top-4">
          <PCard className="p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--p-on-primary)] [background:linear-gradient(135deg,var(--p-primary),var(--p-secondary))]"><MessageCircle className="size-5" /></span>
              <div><p className="text-[14px] font-semibold">Questions about this order?</p><p className="text-[12px] text-[#6B7A90]">Chat with {business.name}</p></div>
            </div>
            <div className="mt-3 flex gap-2">
              <Link href={`/b/${slug}/support?order=${order.id}`} className="flex h-11 flex-1 items-center gap-2 rounded-full bg-[#F3F5F9] px-4 text-[13px] text-[#5B6B80] hover:bg-[#EAEEF4]"><MessageCircle className="size-4" />Chat with support</Link>
              {p.support_phone && <a href={`tel:${p.support_phone}`} aria-label="Call" className="grid size-11 place-items-center rounded-full border border-[#E6EAF1] hover:bg-[#F6F8FB]"><Phone className="size-4" /></a>}
            </div>
          </PCard>

          <PCard className="p-4">
            <p className="text-[14px] font-semibold">Payment</p>
            <dl className="mt-3 grid gap-2 text-[13.5px]">
              <Line k="Services" v={money(d.subtotal)} />
              {Number(d.tax_total) > 0 && <Line k="Tax" v={money(d.tax_total)} />}
              {Number(d.service_fee) > 0 && <Line k="Service charge" v={money(d.service_fee)} />}
              {Number(d.express_fee) > 0 && <Line k="Express" v={money(d.express_fee)} />}
              {Number(d.delivery_fee) > 0 && <Line k="Collection & delivery" v={money(d.delivery_fee)} />}
              {appliedAdj.map((a) => <Line key={a.id} k={a.reason} v={`${Number(a.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(a.amount)))}`} />)}
              {Number(d.discount_total) > 0 && <Line k={`Discount${d.promo_code ? ` (${d.promo_code})` : ""}`} v={`−${money(d.discount_total)}`} />}
              <div className="flex justify-between border-t border-[#EEF1F5] pt-2.5"><dt className="font-semibold">Total</dt><dd className="font-semibold tabular-nums">{money(order.total)}</dd></div>
              {(pays ?? []).map((pmt, i) => <Line key={i} k={`Paid by ${pmt.method.replaceAll("_", " ")}`} v={money(pmt.amount)} />)}
              {(refunds ?? []).map((r, i) => <Line key={`r${i}`} k="Refunded" v={`−${money(r.amount)}`} />)}
              {!order.cancelled_at && balance > 0 && <div className="flex justify-between"><dt className="font-medium text-[#9A5B00]">To pay</dt><dd className="font-semibold tabular-nums text-[#9A5B00]">{money(balance)}</dd></div>}
            </dl>
            {!order.cancelled_at && balance > 0 && bank.account_number && (
              <div className="mt-3 rounded-[calc(var(--p-radius)*0.6)] bg-[#F6F8FB] p-3 text-[12.5px]">
                <p className="flex items-center gap-1.5 font-semibold"><Landmark className="size-4" />Pay by transfer</p>
                <p className="mt-1">{bank.bank_name} · <span className="font-semibold tabular-nums">{bank.account_number}</span></p>
                <p className="text-[#6B7A90]">{bank.account_name}. Use {order.order_number} as the narration.</p>
              </div>
            )}
            {!order.cancelled_at && balance > 0 && !bank.account_number && (
              <p className="mt-3 text-[12px] text-[#6B7A90]">Pay when we collect or deliver, by cash, card or transfer.</p>
            )}
          </PCard>

          {(pays ?? []).length > 0 && (
            <Link href={`/b/${slug}/orders/${order.id}/receipt`} className={`${"inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#DCE2EB] bg-white px-5 text-[14px] font-medium"}`}><Receipt className="size-4" />View receipt</Link>
          )}
          {laundry && !order.cancelled_at && order.stageIndex > 0 && <ReportIssue slug={slug} orderId={order.id} />}
          {canCancel && <CancelOrder slug={slug} orderId={order.id} />}
        </div>
      </div>
    </PortalScreen>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-[#5B6B80]">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>;
}
