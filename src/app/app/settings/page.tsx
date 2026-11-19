import type { Metadata } from "next";
import { Card, CardHeader, DescriptionList } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { PAYMENT_METHODS, NOTIFY_EVENTS } from "@/lib/onboarding";
import { BusinessForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsGeneralPage() {
  const { membership } = await requireTenant("settings.manage");
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("name, email, phone, address, currency, timezone, slug, settings, branding").eq("id", membership.tenantId).single();
  const s = (tenant?.settings ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const label = (list: { value: string; label: string }[], vals: unknown) =>
    Array.isArray(vals) && vals.length ? vals.map((v) => list.find((l) => l.value === v)?.label ?? v).join(", ") : "Not set";

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Business details" description={`Customer portal address: clena.app/${tenant?.slug}`} />
        <div className="p-4"><BusinessForm tenant={tenant!} /></div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Payments" description="Set during setup" />
          <div className="px-4 py-1">
            <DescriptionList items={[
              ["Accepted", label(PAYMENT_METHODS, s.payments?.methods)],
              ["Bank", [s.payments?.bank_name, s.payments?.account_name, s.payments?.account_number].filter(Boolean).join(", ") || "Not set"],
              ["Upfront payment", s.payments?.deposit === "100" ? "Full" : s.payments?.deposit === "50" ? "Half" : "On collection"],
            ]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Customer updates" description="Sending switches on when a messaging provider is connected" />
          <div className="px-4 py-1">
            <DescriptionList items={[
              ["Channels", Array.isArray(s.notifications?.channels) && (s.notifications!.channels as string[]).length ? (s.notifications!.channels as string[]).map((c) => c === "sms" ? "SMS" : c[0].toUpperCase() + c.slice(1)).join(", ") : "Not set"],
              ["Events", label(NOTIFY_EVENTS, s.notifications?.events)],
              ["Signed as", (s.notifications?.sender_name as string) ?? tenant?.name],
            ]} />
          </div>
        </Card>
      </div>
    </div>
  );
}
