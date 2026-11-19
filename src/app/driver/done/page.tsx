import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { OpsShell } from "@/components/ops/shell";
import { Card, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { FAILED_REASONS } from "@/lib/ops-shared";
import { JOB_COLS, driverContext, driverNav, type Job } from "../data";

export const metadata: Metadata = { title: "Completed jobs", robots: { index: false } };

export default async function DriverDone() {
  const ctx = await driverContext();
  const supabase = await createClient();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { data } = await supabase.from("delivery_jobs").select(JOB_COLS).eq("tenant_id", ctx.membership.tenantId)
    .eq("driver_member_id", ctx.memberId ?? "00000000-0000-0000-0000-000000000000").in("status", ["completed", "failed"])
    .gte("completed_at", start.toISOString()).order("completed_at", { ascending: false });
  const jobs = (data ?? []) as Job[];
  const ok = jobs.filter((j) => j.status === "completed").length;
  const time = (v: string | null) => (v ? new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone: ctx.tz }).format(new Date(v)) : "");
  return (
    <OpsShell business={ctx.membership.tenantName} role="Driver" nav={driverNav}>
      <h1 className="text-[18px] font-semibold">Today</h1>
      <div className="mb-4 mt-2 grid grid-cols-3 gap-2 text-center">
        {[["Completed", ok], ["Failed", jobs.length - ok], ["Success", jobs.length ? `${Math.round((ok / jobs.length) * 100)}%` : "—"]].map(([k, v]) => (
          <Card key={k as string} className="p-3"><p className="text-[20px] font-semibold tnum">{v}</p><p className="text-xs text-muted">{k}</p></Card>
        ))}
      </div>
      {jobs.length === 0 ? <Card><EmptyState icon={<CheckCircle2 />} title="No completed jobs yet today" /></Card> : (
        <Card>
          <ul className="divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                {j.status === "completed" ? <CheckCircle2 className="size-5 text-brand-600" /> : <XCircle className="size-5 text-danger-600" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold capitalize">{j.kind} · {j.order_number}</p>
                  <p className="truncate text-muted">{j.customer_name}{j.failed_reason && ` · ${FAILED_REASONS[j.failed_reason]}`}{j.proof_type && ` · ${j.proof_type} proof`}</p>
                </div>
                <span className="text-xs text-faint">{time(j.completed_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </OpsShell>
  );
}
