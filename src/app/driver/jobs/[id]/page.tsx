import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clock, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { OpsShell } from "@/components/ops/shell";
import { Badge, Card } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { JOB_STATUS } from "@/lib/ops-shared";
import { JOB_COLS, driverContext, driverNav, type Job } from "../../data";
import { JobActions } from "./job-actions";

export const metadata: Metadata = { title: "Job", robots: { index: false } };

export default async function DriverJob({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await driverContext();
  const supabase = await createClient();
  const [{ data }, { data: t }] = await Promise.all([
    supabase.from("delivery_jobs").select(JOB_COLS).eq("id", id).maybeSingle(),
    supabase.from("tenants").select("currency").eq("id", ctx.membership.tenantId).single(),
  ]);
  if (!data) notFound(); // RLS: drivers only ever see their own jobs
  const j = data as Job;
  const phone = j.customer_phone?.replace(/[^0-9+]/g, "");
  const wa = phone?.replace(/^\+/, "");
  const maps = j.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(j.address.replace(/^[^:]+:\s*/, ""))}` : null;
  const when = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: ctx.tz }).format(new Date(v)) : "Any time");

  return (
    <OpsShell business={ctx.membership.tenantName} role="Driver" title={`${j.kind === "pickup" ? "Pickup" : "Delivery"} · ${j.order_number}`} back="/driver" nav={driverNav}>
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[17px] font-semibold">{j.customer_name}</p>
          <Badge tone={j.status === "en_route" ? "info" : j.status === "completed" ? "success" : j.status === "failed" ? "danger" : "neutral"}>{JOB_STATUS[j.status]}</Badge>
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-[13.5px]"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" />{j.address ?? "No address"}</p>
        {j.zone_name && <p className="ms-[22px] text-xs text-muted">{j.zone_name}</p>}
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted"><Clock className="size-4" />{when(j.scheduled_start)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {phone ? <a href={`tel:${phone}`} className="flex h-12 flex-col items-center justify-center rounded-lg border border-line text-[12px] font-semibold"><Phone className="size-4" />Call</a> : <span />}
          {wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex h-12 flex-col items-center justify-center rounded-lg border border-line text-[12px] font-semibold"><MessageCircle className="size-4" />WhatsApp</a> : <span />}
          {maps ? <a href={maps} target="_blank" rel="noopener noreferrer" className="flex h-12 flex-col items-center justify-center rounded-lg bg-navy-900 text-[12px] font-semibold text-white"><Navigation className="size-4" />Navigate</a> : <span />}
        </div>
        {(j.instructions || j.items_summary) && (
          <div className="mt-4 grid gap-1 rounded-lg bg-canvas p-3 text-[13px]">
            {j.items_summary && <p><span className="text-muted">Items: </span>{j.items_summary}</p>}
            {j.instructions && <p><span className="text-muted">Instructions: </span>{j.instructions}</p>}
          </div>
        )}
      </Card>
      <div className="mt-3"><Card className="p-4"><JobActions job={{ id: j.id, kind: j.kind, status: j.status, amountDue: Number(j.amount_due ?? 0), currency: t?.currency ?? "NGN" }} /></Card></div>
    </OpsShell>
  );
}
