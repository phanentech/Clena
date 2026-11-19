import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { PortalShell } from "@/components/app/portal-shell";
import { Badge, Card, EmptyState, StageBadge } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { getCustomerProfiles, requireUser } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { PAYMENT_LABEL, PAYMENT_TONE, type PaymentStatus } from "@/lib/orders";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default async function CustomerHome() {
  const user = await requireUser("/customer");
  const profiles = await getCustomerProfiles();
  // Each customer login belongs to one business: open that business's own app.
  const slug = (profiles[0]?.tenants as unknown as { slug: string } | null)?.slug;
  if (profiles.length === 1 && slug) redirect(`/b/${slug}`);
  const supabase = await createClient();

  // RLS returns only orders that belong to this login's customer records.
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, total, amount_paid, currency, payment_status, created_at, expected_at, current_stage_id, tenant_id, tenants(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const stageIds = [...new Set(orders.map((o) => o.current_stage_id))];
  const { data: stages } = stageIds.length
    ? await supabase.from("workflow_stages").select("id, name, color").in("id", stageIds)
    : { data: [] };
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));

  return (
    <PortalShell title={`Hi ${user.fullName?.split(" ")[0] ?? "there"}`} subtitle="Track your orders and payments.">
      {profiles.length === 0 ? (
        <Card><EmptyState icon={<PackageSearch />} title="No orders linked to your account yet"
          description="When a business on Clena adds you as a customer with this email, your orders will appear here." /></Card>
      ) : orders.length === 0 ? (
        <Card><EmptyState icon={<PackageSearch />} title="No orders yet" description="Your orders will show here as soon as they're created." /></Card>
      ) : (
        <ul className="grid gap-3">
          {orders.map((o) => {
            // Stages the business hides from customers aren't readable; show a neutral label instead.
            const stage = stageById.get(o.current_stage_id);
            return (
              <li key={o.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">{(o.tenants as unknown as { name: string } | null)?.name}</p>
                      <p className="font-semibold">Order {o.order_number}</p>
                      <p className="text-xs text-muted">{formatDateTime(o.created_at)}</p>
                    </div>
                    {stage ? <StageBadge name={stage.name} color={stage.color} /> : <Badge>In progress</Badge>}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
                    <span className="font-semibold">{formatMoney(o.total, o.currency)}</span>
                    <Badge tone={PAYMENT_TONE[o.payment_status as PaymentStatus]}>{PAYMENT_LABEL[o.payment_status as PaymentStatus]}</Badge>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PortalShell>
  );
}
