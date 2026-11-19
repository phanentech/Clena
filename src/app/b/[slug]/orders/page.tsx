import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { Chip, PCard, PortalScreen, StageTrack, pButton } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { getMyOrders, itemSummary } from "@/lib/portal-orders";
import { cn, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "My orders" };

const PAY: Record<string, [string, "accent" | "warn" | "neutral" | "danger"]> = {
  paid: ["Paid", "accent"], partially_paid: ["Part-paid", "warn"], unpaid: ["Unpaid", "neutral"], refunded: ["Refunded", "neutral"],
};

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab = "active" } = await searchParams;
  const { business } = await requireCustomer(slug);
  const all = await getMyOrders(business.id);
  const active = all.filter((o) => !o.done);
  const past = all.filter((o) => o.done);
  const list = tab === "past" ? past : active;
  const date = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(d));

  return (
    <PortalScreen business={business} title="My orders" subtitle={`${all.length} order${all.length === 1 ? "" : "s"} with ${business.name}`}>
      <div className="mb-4 grid grid-cols-2 rounded-full border border-[#E6EAF1] bg-white p-1" role="tablist">
        {[["active", `Active (${active.length})`], ["past", `Completed (${past.length})`]].map(([k, label]) => (
          <Link key={k} href={`/b/${slug}/orders?tab=${k}`} role="tab" aria-selected={tab === k}
            className={cn("rounded-full py-2 text-center text-[13px] font-semibold", tab === k ? "bg-[var(--p-primary)] text-[var(--p-on-primary)]" : "text-[#5B6B80]")}>{label}</Link>
        ))}
      </div>
      {list.length === 0 ? (
        <PCard className="p-8 text-center">
          <p className="text-[15px] font-semibold">{tab === "past" ? "No completed orders yet" : "No active orders"}</p>
          <p className="mt-1 text-[13px] text-[#6B7A90]">Orders you place will appear here so you can track them.</p>
          <Link href={`/b/${slug}/services`} className={`${pButton.primary} mt-4`}>Start an order</Link>
        </PCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((o) => {
            const [payLabel, payTone] = PAY[o.payment_status] ?? ["", "neutral"];
            return (
              <Link key={o.id} href={`/b/${slug}/orders/${o.id}`}>
                <PCard className="h-full p-4 transition-colors hover:border-[#D3DAE5]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold">{o.order_number}</span>
                    <div className="flex items-center gap-1.5">
                      {o.cancelled_at ? <Chip tone="danger">Cancelled</Chip> : <Chip tone={o.done ? "neutral" : "accent"}>{o.stageName}</Chip>}
                      <ChevronRight className="size-4 text-[#9AA5B5]" />
                    </div>
                  </div>
                  <p className="mt-1 text-[12.5px] text-[#6B7A90]">{date(o.created_at)} · {itemSummary(o.items)}</p>
                  {!o.done && <StageTrack stages={o.stages} currentIndex={o.stageIndex} />}
                  <div className="mt-3 flex items-center justify-between border-t border-[#EEF1F5] pt-3">
                    <span className="text-[15px] font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</span>
                    {!o.cancelled_at && <Chip tone={payTone}>{payLabel}</Chip>}
                  </div>
                </PCard>
              </Link>
            );
          })}
        </div>
      )}
    </PortalScreen>
  );
}
