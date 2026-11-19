import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Check } from "lucide-react";
import { SubscribeButton, CancelSubscriptionButton } from "@/components/portal/subscription-buttons";
import { Chip, PCard, PortalScreen } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Subscriptions" };

const STATUS: Record<string, [string, "accent" | "warn" | "neutral" | "danger"]> = {
  active: ["Active", "accent"], pending_payment: ["Awaiting payment", "warn"], paused: ["Paused", "neutral"], cancelled: ["Cancelled", "neutral"], expired: ["Expired", "danger"],
};

export default async function SubscriptionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business, customer } = await requireCustomer(slug);
  if (!business.laundry_ops) notFound();
  const supabase = await createClient();
  const { data: subs } = await supabase.from("customer_subscriptions").select("id, plan_id, status, current_period_start, current_period_end, auto_renew, created_at")
    .eq("customer_id", customer.id).order("created_at", { ascending: false });
  const plans = business.plans ?? [];
  const money = (n: number) => formatMoney(n, business.currency);
  const when = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: business.timezone }).format(new Date(v)) : "—");
  const live = (subs ?? []).filter((s) => ["active", "pending_payment", "paused"].includes(s.status));
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "Plan";
  const bank = business.portal;

  return (
    <PortalScreen business={business} title="Subscriptions" subtitle="Regular laundry for a fixed monthly price." back={`/b/${slug}/profile`}>
      {live.length > 0 && (
        <div className="mb-4 grid gap-3">
          {live.map((s) => {
            const [label, tone] = STATUS[s.status];
            const p = plans.find((x) => x.id === s.plan_id);
            return (
              <PCard key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[15px] font-semibold">{planName(s.plan_id)}</p>{p && <p className="text-[12.5px] text-[#6B7A90]">{money(p.price)} every {p.period_days} days · {p.included_kg} kg</p>}</div>
                  <Chip tone={tone}>{label}</Chip>
                </div>
                {s.status === "active" && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[#4A5A70]"><CalendarClock className="size-4" />Renews {when(s.current_period_end)}{s.auto_renew ? "" : " (won't renew)"}</p>}
                {s.status === "pending_payment" && <p className="mt-2 text-[12.5px] text-[#9A5B00]">Pay {p ? money(p.price) : "the plan price"} by transfer or at pickup. We&apos;ll activate your plan as soon as payment is confirmed.{bank.support_phone ? ` Questions? Call ${bank.support_phone}.` : ""}</p>}
                {s.auto_renew && s.status !== "cancelled" && <div className="mt-3"><CancelSubscriptionButton slug={slug} subId={s.id} /></div>}
              </PCard>
            );
          })}
        </div>
      )}
      {plans.length === 0 ? (
        <PCard className="p-8 text-center text-[13px] text-[#6B7A90]">No plans available right now.</PCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <PCard key={p.id} className="flex flex-col p-4">
              <p className="text-[15px] font-semibold">{p.name}</p>
              <p className="mt-1 text-[24px] font-semibold tabular-nums">{money(p.price)}<span className="text-[12.5px] font-normal text-[#6B7A90]"> / {p.period_days} days</span></p>
              {p.description && <p className="mt-1 text-[12.5px] text-[#5B6B80]">{p.description}</p>}
              <ul className="mt-3 grid flex-1 gap-1.5 text-[12.5px]">
                <li className="flex gap-2"><Check className="size-4 shrink-0 text-[var(--p-accent)]" />{p.included_kg} kg of washing included</li>
                {p.free_delivery && <li className="flex gap-2"><Check className="size-4 shrink-0 text-[var(--p-accent)]" />Free pickup and delivery</li>}
                <li className="flex gap-2"><Check className="size-4 shrink-0 text-[var(--p-accent)]" />Anything over is charged at normal prices</li>
              </ul>
              <div className="mt-4"><SubscribeButton slug={slug} planId={p.id} disabled={live.length > 0} /></div>
            </PCard>
          ))}
        </div>
      )}
    </PortalScreen>
  );
}
