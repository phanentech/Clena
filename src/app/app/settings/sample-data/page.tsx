import type { Metadata } from "next";
import { Alert, Card, CardHeader } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils";
import { clearSampleData, loadSampleData } from "./actions";

export const metadata: Metadata = { title: "Sample data" };

export default async function SampleDataPage({ searchParams }: { searchParams: Promise<{ cleared?: string }> }) {
  const { membership } = await requireTenant("settings.manage");
  const { cleared } = await searchParams;
  const supabase = await createClient();
  const [{ data: tenant }, { count: orders }, { count: customers }] = await Promise.all([
    supabase.from("tenants").select("settings").eq("id", membership.tenantId).single(),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId).eq("is_demo", true),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId).eq("is_demo", true),
  ]);
  const loadedAt = (tenant?.settings as Record<string, string> | null)?.demo_data_loaded_at;
  const hasData = (orders ?? 0) > 0 || (customers ?? 0) > 0;
  return (
    <Card>
      <CardHeader title="Sample data" description="Realistic customers, orders, payments and bookings for exploring Clena. Every sample record is flagged and kept apart from your real records." />
      <div className="grid gap-4 p-4">
        {cleared && <Alert tone="success">Sample data removed. Your own records were not touched.</Alert>}
        {hasData ? (
          <>
            <p className="text-[13px]">
              <span className="font-semibold tnum">{orders} sample orders</span> and <span className="font-semibold tnum">{customers} sample customers</span> are in this business
              {loadedAt ? `, added ${formatDateTime(loadedAt)}` : ""}. Remove them before you start taking real orders, so your reports show only real numbers.
            </p>
            <form action={clearSampleData}><SubmitButton variant="danger" pendingLabel="Removing…">Remove sample data</SubmitButton></form>
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted">Adds about 40 customers, 180 orders spread over the last 75 days, payments and 30 bookings, priced from your own services and moved through your workflow stages.</p>
            <form action={loadSampleData}><SubmitButton pendingLabel="Adding sample data…">Add sample data</SubmitButton></form>
          </>
        )}
      </div>
    </Card>
  );
}
