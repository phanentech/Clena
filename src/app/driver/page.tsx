import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, MapPin, PackageOpen, Truck } from "lucide-react";
import { OpsShell } from "@/components/ops/shell";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { JOB_STATUS } from "@/lib/ops-shared";
import { cn, formatMoney } from "@/lib/utils";
import { AvailabilityToggle } from "./availability";
import { JOB_COLS, driverContext, driverNav, type Job } from "./data";

export const metadata: Metadata = { title: "My jobs", robots: { index: false } };

export default async function DriverHome() {
  const ctx = await driverContext();
  const supabase = await createClient();
  const { data } = await supabase.from("delivery_jobs").select(JOB_COLS).eq("tenant_id", ctx.membership.tenantId)
    .eq("driver_member_id", ctx.memberId ?? "00000000-0000-0000-0000-000000000000").in("status", ["assigned", "en_route"])
    .order("route_seq", { ascending: true, nullsFirst: false }).order("scheduled_start");
  const jobs = (data ?? []) as Job[];
  const time = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: ctx.tz }).format(new Date(v)) : "Any time");

  return (
    <OpsShell business={ctx.membership.tenantName} role="Driver" nav={driverNav}>
      <AvailabilityToggle initial={ctx.available} />
      <h1 className="mb-2 mt-5 text-[18px] font-semibold">My jobs <span className="text-[14px] font-normal text-muted">({jobs.length})</span></h1>
      {jobs.length === 0 ? (
        <Card><EmptyState icon={<Truck />} title="No jobs assigned" description="Pickups and deliveries assigned to you appear here, in route order." /></Card>
      ) : (
        <ol className="grid gap-2.5">
          {jobs.map((j, i) => (
            <li key={j.id}>
              <Link href={`/driver/jobs/${j.id}`} className={cn("flex gap-3 rounded-xl border bg-surface p-3.5 active:bg-subtle", j.status === "en_route" ? "border-teal-500/50" : "border-line")}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy-900 text-[13px] font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 text-[13px] font-semibold", j.kind === "pickup" ? "text-teal-600" : "text-brand-700")}>
                      {j.kind === "pickup" ? <PackageOpen className="size-4" /> : <Truck className="size-4" />}{j.kind === "pickup" ? "Pickup" : "Delivery"}
                    </span>
                    <span className="text-xs text-muted">{j.order_number}</span>
                    <Badge tone={j.status === "en_route" ? "info" : "neutral"} className="ms-auto">{JOB_STATUS[j.status]}</Badge>
                  </div>
                  <p className="mt-1 text-[14.5px] font-semibold">{j.customer_name}</p>
                  <p className="mt-0.5 flex items-start gap-1 text-xs text-muted"><MapPin className="mt-0.5 size-3.5 shrink-0" />{j.address ?? "No address"}{j.zone_name && ` · ${j.zone_name}`}</p>
                  <p className="mt-1 text-xs font-medium text-ink">{time(j.scheduled_start)}{j.kind === "delivery" && Number(j.amount_due) > 0 && <> · Collect {formatMoney(Number(j.amount_due), ctx.currency)}</>}</p>
                </div>
                <ChevronRight className="size-5 shrink-0 self-center text-faint" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </OpsShell>
  );
}
